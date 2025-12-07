// gru.js
class GRUModel {
    constructor(featureCount, lookback = 60, horizon = 5) {
        this.featureCount = featureCount;
        this.lookback = lookback;
        this.horizon = horizon;
        this.model = null;
        this.history = null;
        this.isTrained = false;
    }

    /**
     * Build and compile the GRU model
     */
    buildModel() {
        this.model = tf.sequential();
        
        // First GRU layer
        this.model.add(tf.layers.gru({
            units: 64,
            returnSequences: true,
            inputShape: [this.lookback, this.featureCount],
            kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
        }));
        
        // Dropout for regularization
        this.model.add(tf.layers.dropout({ rate: 0.3 }));
        
        // Second GRU layer
        this.model.add(tf.layers.gru({
            units: 32,
            kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
        }));
        
        // Dense layers
        this.model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
        this.model.add(tf.layers.dropout({ rate: 0.2 }));
        this.model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
        
        // Compile model
        this.model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy', 'mse']
        });
        
        console.log('Model built successfully');
        this.model.summary();
        
        return this.model;
    }

    /**
     * Train the model
     * @param {tf.Tensor} X_train - Training features
     * @param {tf.Tensor} y_train - Training labels
     * @param {tf.Tensor} X_test - Testing features
     * @param {tf.Tensor} y_test - Testing labels
     * @param {number} epochs - Number of training epochs
     * @param {Function} onEpochEnd - Callback for epoch updates
     * @returns {Promise} Training history
     */
    async train(X_train, y_train, X_test, y_test, epochs = 50, onEpochEnd = null) {
        if (!this.model) {
            this.buildModel();
        }

        // Calculate batch size (use 32 or smaller for browser memory)
        const batchSize = Math.min(32, X_train.shape[0]);
        
        this.history = await this.model.fit(X_train, y_train, {
            epochs: epochs,
            batchSize: batchSize,
            validationData: [X_test, y_test],
            callbacks: {
                onEpochEnd: async (epoch, logs) => {
                    // Clean up memory
                    tf.tidy(() => {});
                    await tf.nextFrame();
                    
                    if (onEpochEnd) {
                        onEpochEnd(epoch, logs);
                    }
                }
            }
        });

        this.isTrained = true;
        console.log('Training completed');
        
        return this.history;
    }

    /**
     * Predict on test data
     * @param {tf.Tensor} X - Input features
     * @returns {Array} Predictions
     */
    predict(X) {
        if (!this.model || !this.isTrained) {
            throw new Error('Model not trained yet');
        }

        const predictions = this.model.predict(X);
        return predictions;
    }

    /**
     * Evaluate model performance
     * @param {tf.Tensor} X_test - Test features
     * @param {tf.Tensor} y_test - Test labels
     * @returns {Object} Evaluation metrics
     */
    async evaluate(X_test, y_test) {
        if (!this.model || !this.isTrained) {
            throw new Error('Model not trained yet');
        }

        const evaluation = this.model.evaluate(X_test, y_test);
        const loss = await evaluation[0].dataSync()[0];
        const accuracy = await evaluation[1].dataSync()[0];
        const mse = await evaluation[2].dataSync()[0];

        // Calculate confusion matrix
        const predictions = this.predict(X_test);
        const predValues = await predictions.dataSync();
        const trueValues = await y_test.dataSync();
        
        let tp = 0, tn = 0, fp = 0, fn = 0;
        
        for (let i = 0; i < predValues.length; i++) {
            const pred = predValues[i] > 0.5 ? 1 : 0;
            const trueVal = trueValues[i];
            
            if (pred === 1 && trueVal === 1) tp++;
            else if (pred === 0 && trueVal === 0) tn++;
            else if (pred === 1 && trueVal === 0) fp++;
            else if (pred === 0 && trueVal === 1) fn++;
        }

        // Clean up
        predictions.dispose();
        evaluation.forEach(tensor => tensor.dispose());

        return {
            loss,
            accuracy,
            mse,
            confusionMatrix: { tp, tn, fp, fn },
            totalSamples: predValues.length
        };
    }

    /**
     * Predict future days
     * @param {tf.Tensor} latestSequence - Most recent sequence
     * @returns {Array} Future predictions (0-1 probabilities)
     */
    async predictFuture(latestSequence) {
        if (!this.model || !this.isTrained) {
            throw new Error('Model not trained yet');
        }

        const prediction = this.model.predict(latestSequence);
        const value = await prediction.dataSync()[0];
        
        prediction.dispose();
        
        return value;
    }

    /**
     * Save model weights
     * @returns {Object} Model weights
     */
    async saveWeights() {
        if (!this.model) {
            throw new Error('Model not built yet');
        }
        
        const weights = await this.model.getWeights();
        const weightData = await Promise.all(weights.map(async w => {
            return {
                data: await w.dataSync(),
                shape: w.shape
            };
        }));
        
        return {
            featureCount: this.featureCount,
            lookback: this.lookback,
            horizon: this.horizon,
            weights: weightData
        };
    }

    /**
     * Load model weights
     * @param {Object} weightData - Saved weight data
     */
    async loadWeights(weightData) {
        if (!this.model) {
            this.featureCount = weightData.featureCount;
            this.lookback = weightData.lookback;
            this.horizon = weightData.horizon;
            this.buildModel();
        }
        
        const weights = weightData.weights.map(w => 
            tf.tensor(w.data, w.shape)
        );
        
        this.model.setWeights(weights);
        this.isTrained = true;
        
        // Dispose temporary tensors
        weights.forEach(w => w.dispose());
    }

    /**
     * Dispose model and free memory
     */
    dispose() {
        if (this.model) {
            this.model.dispose();
            this.model = null;
        }
        this.isTrained = false;
        this.history = null;
    }
}

export default GRUModel;
