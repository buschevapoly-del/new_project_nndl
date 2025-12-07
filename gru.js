// gru.js
/**
 * GRU Model Module
 * Defines, trains, and evaluates the GRU model for stock prediction
 */

class GRUModel {
    constructor() {
        this.model = null;
        this.isTraining = false;
        this.trainingHistory = {
            loss: [],
            valLoss: [],
            accuracy: [],
            valAccuracy: [],
            epochs: []
        };
        this.inputShape = [60, 1]; // 60 days, 1 feature
        this.outputShape = 5; // Predict 5 days
    }

    /**
     * Build and compile the GRU model
     */
    buildModel() {
        // Clear any existing model
        if (this.model) {
            this.model.dispose();
        }

        this.model = tf.sequential();
        
        // First GRU layer
        this.model.add(tf.layers.gru({
            units: 64,
            returnSequences: true,
            inputShape: this.inputShape,
            kernelInitializer: 'glorotNormal'
        }));
        
        // Dropout for regularization
        this.model.add(tf.layers.dropout({ rate: 0.2 }));
        
        // Second GRU layer
        this.model.add(tf.layers.gru({
            units: 32,
            returnSequences: false,
            kernelInitializer: 'glorotNormal'
        }));
        
        // Dropout
        this.model.add(tf.layers.dropout({ rate: 0.2 }));
        
        // Dense layer
        this.model.add(tf.layers.dense({
            units: 16,
            activation: 'relu',
            kernelInitializer: 'heNormal'
        }));
        
        // Output layer - predict 5 days
        this.model.add(tf.layers.dense({
            units: this.outputShape,
            activation: 'linear',
            kernelInitializer: 'glorotNormal'
        }));
        
        // Compile model
        this.model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'meanSquaredError',
            metrics: ['mae'] // Mean Absolute Error
        });
        
        console.log('Model built successfully');
        this.model.summary();
        
        return this.model;
    }

    /**
     * Train the model
     * @param {tf.Tensor} X_train - Training features
     * @param {tf.Tensor} y_train - Training labels
     * @param {tf.Tensor} X_val - Validation features
     * @param {tf.Tensor} y_val - Validation labels
     * @param {Object} callbacks - Training callbacks
     * @returns {Promise} - Training history
     */
    async train(X_train, y_train, X_val, y_val, callbacks = {}) {
        if (!this.model) {
            throw new Error('Model not built. Call buildModel() first.');
        }
        
        if (!X_train || !y_train) {
            throw new Error('Training data not provided');
        }
        
        this.isTraining = true;
        
        const batchSize = 32;
        const epochs = 50;
        
        try {
            const history = await this.model.fit(X_train, y_train, {
                batchSize,
                epochs,
                validationData: [X_val, y_val],
                callbacks: {
                    onEpochEnd: (epoch, logs) => {
                        // Store training history
                        this.trainingHistory.loss.push(logs.loss);
                        this.trainingHistory.valLoss.push(logs.val_loss);
                        this.trainingHistory.accuracy.push(logs.mae); // Using MAE as accuracy proxy
                        this.trainingHistory.valAccuracy.push(logs.val_mae);
                        this.trainingHistory.epochs.push(epoch + 1);
                        
                        // Call user callback if provided
                        if (callbacks.onEpochEnd) {
                            callbacks.onEpochEnd(epoch, logs);
                        }
                        
                        // Check if training should stop
                        if (!this.isTraining) {
                            this.model.stopTraining = true;
                        }
                    },
                    onTrainEnd: () => {
                        this.isTraining = false;
                        if (callbacks.onTrainEnd) {
                            callbacks.onTrainEnd();
                        }
                    }
                },
                shuffle: true,
                verbose: 0
            });
            
            return history;
        } catch (error) {
            this.isTraining = false;
            throw error;
        }
    }

    /**
     * Stop training
     */
    stopTraining() {
        this.isTraining = false;
        if (this.model) {
            this.model.stopTraining = true;
        }
    }

    /**
     * Make predictions
     * @param {tf.Tensor} X - Input data
     * @returns {tf.Tensor} - Predictions
     */
    predict(X) {
        if (!this.model) {
            throw new Error('Model not trained');
        }
        
        return this.model.predict(X);
    }

    /**
     * Evaluate model on test data
     * @param {tf.Tensor} X_test - Test features
     * @param {tf.Tensor} y_test - Test labels
     * @returns {Object} - Evaluation metrics
     */
    evaluate(X_test, y_test) {
        if (!this.model) {
            throw new Error('Model not trained');
        }
        
        const results = this.model.evaluate(X_test, y_test);
        const loss = results[0].dataSync()[0];
        const mae = results[1].dataSync()[0];
        
        // Clean up
        results.forEach(tensor => tensor.dispose());
        
        return {
            loss: loss,
            mae: mae,
            rmse: Math.sqrt(loss) // Root Mean Squared Error
        };
    }

    /**
     * Forecast next N days using the latest window
     * @param {tf.Tensor} latestWindow - Latest window of data
     * @returns {Array} - Forecasted values
     */
    forecast(latestWindow) {
        if (!this.model) {
            throw new Error('Model not trained');
        }
        
        const prediction = this.predict(latestWindow);
        const values = Array.from(prediction.dataSync());
        prediction.dispose();
        
        return values;
    }

    /**
     * Save model weights
     * @returns {Object} - Model weights
     */
    async saveWeights() {
        if (!this.model) {
            throw new Error('Model not trained');
        }
        
        return await this.model.save('localstorage://sp500-gru-model');
    }

    /**
     * Load model weights
     * @returns {boolean} - Success status
     */
    async loadWeights() {
        try {
            // Check if weights exist
            const modelArtifacts = localStorage.getItem('tensorflowjs_models/sp500-gru-model/model_info');
            if (!modelArtifacts) {
                return false;
            }
            
            // Build model first
            this.buildModel();
            
            // Load weights
            await this.model.load('localstorage://sp500-gru-model');
            console.log('Model weights loaded successfully');
            return true;
        } catch (error) {
            console.error('Failed to load model weights:', error);
            return false;
        }
    }

    /**
     * Get model summary
     * @returns {Object} - Model information
     */
    getModelInfo() {
        if (!this.model) {
            return null;
        }
        
        const trainableParams = this.model.trainableWeights
            .map(w => w.shape.reduce((a, b) => a * b))
            .reduce((a, b) => a + b, 0);
        
        return {
            layers: this.model.layers.length,
            trainableParams: trainableParams.toLocaleString(),
            inputShape: this.inputShape,
            outputShape: this.outputShape
        };
    }

    /**
     * Clean up model and tensors
     */
    dispose() {
        if (this.model) {
            this.model.dispose();
            this.model = null;
        }
        this.isTraining = false;
        this.trainingHistory = {
            loss: [],
            valLoss: [],
            accuracy: [],
            valAccuracy: [],
            epochs: []
        };
    }
}

// Export singleton instance
export const gruModel = new GRUModel();
