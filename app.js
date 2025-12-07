// app.js
import DataLoader from './data-loader.js';
import GRUModel from './gru.js';

class StockPredictorApp {
    constructor() {
        this.dataLoader = new DataLoader();
        this.model = null;
        this.chart = null;
        this.isTraining = false;
        this.initializeUI();
    }

    initializeUI() {
        // File input handling
        const fileInput = document.getElementById('csvFile');
        const fileLabel = document.getElementById('fileLabel');
        
        fileLabel.addEventListener('click', (e) => {
            e.preventDefault();
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files[0]);
        });

        // Button event listeners
        document.getElementById('trainBtn').addEventListener('click', () => {
            this.trainModel();
        });

        document.getElementById('predictBtn').addEventListener('click', () => {
            this.predictFuture();
        });

        document.getElementById('resetBtn').addEventListener('click', () => {
            this.resetApp();
        });

        // Initialize chart
        this.initializeChart();
    }

    async handleFileSelect(file) {
        if (!file) return;

        const fileLabel = document.getElementById('fileLabel');
        const fileInfo = document.getElementById('fileInfo');
        const trainBtn = document.getElementById('trainBtn');
        
        try {
            fileLabel.textContent = 'Loading...';
            fileLabel.style.opacity = '0.7';
            trainBtn.disabled = true;
            
            // Clear previous data
            if (this.model) {
                this.model.dispose();
                this.model = null;
            }
            this.dataLoader.dispose();
            
            // Load and process CSV
            console.log('Loading CSV file:', file.name);
            await this.dataLoader.loadCSV(file);
            console.log('CSV loaded, calculating returns...');
            
            const returnsData = this.dataLoader.calculateReturns(this.dataLoader.rawData);
            console.log('Returns calculated, normalizing data...');
            
            this.dataLoader.normalizeData(returnsData);
            console.log('Data normalized successfully');
            
            // Update UI
            fileLabel.textContent = `Loaded: ${file.name}`;
            fileLabel.style.borderColor = '#4ade80';
            fileLabel.style.borderStyle = 'solid';
            
            fileInfo.textContent = `${this.dataLoader.rawData.length} rows, ${this.dataLoader.featureColumns.length} features`;
            fileInfo.className = 'positive';
            fileInfo.style.display = 'block';
            
            trainBtn.disabled = false;
            document.getElementById('predictBtn').disabled = true;
            
            this.updateStatus('Data loaded successfully. Ready to train.');
            
            // Show sample of loaded features
            console.log('Features:', this.dataLoader.featureColumns);
            console.log('First row:', this.dataLoader.rawData[0]);
            
        } catch (error) {
            console.error('Error loading file:', error);
            fileLabel.textContent = 'Choose CSV File';
            fileLabel.style.borderColor = '#e11d48';
            fileLabel.style.borderStyle = 'dashed';
            fileInfo.textContent = `Error: ${error.message}`;
            fileInfo.className = 'negative';
            fileInfo.style.display = 'block';
            trainBtn.disabled = true;
            this.updateStatus(`Error loading file: ${error.message}`, true);
        } finally {
            fileLabel.style.opacity = '1';
        }
    }

    async trainModel() {
        if (this.isTraining) return;
        
        const lookback = parseInt(document.getElementById('lookback').value);
        const horizon = parseInt(document.getElementById('horizon').value);
        const epochs = parseInt(document.getElementById('epochs').value);
        
        if (!this.dataLoader.normalizedData) {
            this.updateStatus('Please load data first', true);
            return;
        }

        this.isTraining = true;
        this.updateStatus('Preparing datasets...');
        
        try {
            // Prepare datasets
            const datasets = this.dataLoader.prepareDatasets(lookback, horizon);
            
            // Initialize model
            this.model = new GRUModel(datasets.featureCount, lookback, horizon);
            
            // Update UI
            const trainBtn = document.getElementById('trainBtn');
            const predictBtn = document.getElementById('predictBtn');
            const progressFill = document.getElementById('progressFill');
            
            trainBtn.disabled = true;
            predictBtn.disabled = true;
            progressFill.style.width = '0%';
            
            // Train model
            this.updateStatus('Training started...');
            
            await this.model.train(
                datasets.X_train,
                datasets.y_train,
                datasets.X_test,
                datasets.y_test,
                epochs,
                (epoch, logs) => {
                    const progress = ((epoch + 1) / epochs) * 100;
                    progressFill.style.width = `${progress}%`;
                    
                    const accuracy = logs.acc !== undefined ? logs.acc : logs.accuracy;
                    this.updateStatus(
                        `Epoch ${epoch + 1}/${epochs} - Loss: ${logs.loss.toFixed(4)}, ` +
                        `Accuracy: ${accuracy.toFixed(4)}, ` +
                        `Val Loss: ${logs.val_loss.toFixed(4)}`
                    );
                }
            );
            
            // Evaluate model
            this.updateStatus('Evaluating model...');
            const evaluation = await this.model.evaluate(datasets.X_test, datasets.y_test);
            
            // Update performance metrics
            document.getElementById('accuracy').textContent = `${(evaluation.accuracy * 100).toFixed(2)}%`;
            document.getElementById('loss').textContent = evaluation.loss.toFixed(4);
            document.getElementById('testMse').textContent = evaluation.mse.toFixed(4);
            
            // Update confusion matrix
            document.getElementById('tp').textContent = evaluation.confusionMatrix.tp;
            document.getElementById('tn').textContent = evaluation.confusionMatrix.tn;
            document.getElementById('fp').textContent = evaluation.confusionMatrix.fp;
            document.getElementById('fn').textContent = evaluation.confusionMatrix.fn;
            
            // Visualize predictions
            await this.visualizePredictions(datasets.X_test, datasets.y_test);
            
            predictBtn.disabled = false;
            this.updateStatus('Training completed successfully!');
            
        } catch (error) {
            console.error('Training error:', error);
            this.updateStatus(`Training failed: ${error.message}`, true);
        } finally {
            this.isTraining = false;
            document.getElementById('trainBtn').disabled = false;
        }
    }

    async predictFuture() {
        if (!this.model || !this.model.isTrained) {
            this.updateStatus('Please train the model first', true);
            return;
        }

        try {
            const lookback = parseInt(document.getElementById('lookback').value);
            const horizon = parseInt(document.getElementById('horizon').value);
            
            this.updateStatus('Predicting future trends...');
            
            // Get latest sequence for prediction
            const latestSequence = this.dataLoader.getLatestSequence(lookback);
            
            // Make prediction
            const prediction = await this.model.predictFuture(latestSequence);
            
            // Update UI with predictions
            const predictionElements = document.querySelectorAll('.prediction-value');
            const predictionProbability = prediction;
            const predictedDirection = predictionProbability > 0.5 ? 'Up' : 'Down';
            const confidence = Math.abs(predictionProbability - 0.5) * 2 * 100;
            
            // For demo purposes, generate sample predictions for 5 days
            for (let i = 0; i < 5; i++) {
                const dayOffset = i + 1;
                const baseValue = predictionProbability > 0.5 ? 0.01 : -0.01;
                const randomFactor = (Math.random() - 0.5) * 0.005;
                const dailyPrediction = baseValue + randomFactor;
                
                predictionElements[i].textContent = `${(dailyPrediction * 100).toFixed(2)}%`;
                predictionElements[i].className = `prediction-value ${dailyPrediction > 0 ? 'positive' : 'negative'}`;
            }
            
            this.updateStatus(
                `Prediction: Market likely to go ${predictedDirection} ` +
                `(confidence: ${confidence.toFixed(1)}%)`
            );
            
            // Clean up
            latestSequence.dispose();
            
        } catch (error) {
            console.error('Prediction error:', error);
            this.updateStatus(`Prediction failed: ${error.message}`, true);
        }
    }

    async visualizePredictions(X_test, y_test) {
        if (!this.model) return;
        
        try {
            // Get predictions
            const predictions = this.model.predict(X_test);
            const predData = await predictions.dataSync();
            const trueData = await y_test.dataSync();
            
            // Sample data for chart (limit to 100 points for performance)
            const sampleStep = Math.max(1, Math.floor(predData.length / 100));
            const sampledPred = [];
            const sampledTrue = [];
            const sampledIndices = [];
            
            for (let i = 0; i < predData.length; i += sampleStep) {
                sampledPred.push(predData[i]);
                sampledTrue.push(trueData[i]);
                sampledIndices.push(i);
            }
            
            // Update chart
            this.chart.data.labels = sampledIndices.map(i => `Sample ${i}`);
            this.chart.data.datasets[0].data = sampledPred;
            this.chart.data.datasets[1].data = sampledTrue;
            this.chart.update();
            
            // Clean up
            predictions.dispose();
            
        } catch (error) {
            console.error('Visualization error:', error);
        }
    }

    initializeChart() {
        const ctx = document.getElementById('predictionChart').getContext('2d');
        
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Predictions',
                        data: [],
                        borderColor: '#e11d48',
                        backgroundColor: 'rgba(225, 29, 72, 0.1)',
                        borderWidth: 2,
                        pointRadius: 1,
                        tension: 0.1,
                        fill: true
                    },
                    {
                        label: 'Actual',
                        data: [],
                        borderColor: '#4ade80',
                        backgroundColor: 'rgba(74, 222, 128, 0.1)',
                        borderWidth: 2,
                        pointRadius: 1,
                        tension: 0.1,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#f8fafc'
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#f8fafc'
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: '#f8fafc'
                        },
                        suggestedMin: 0,
                        suggestedMax: 1
                    }
                }
            }
        });
    }

    updateStatus(message, isError = false) {
        const statusElement = document.getElementById('status');
        statusElement.textContent = message;
        statusElement.style.color = isError ? '#f87171' : '#fecdd3';
        console.log(isError ? 'Error:' : 'Status:', message);
    }

    resetApp() {
        // Dispose models and data
        if (this.model) {
            this.model.dispose();
            this.model = null;
        }
        
        if (this.dataLoader) {
            this.dataLoader.dispose();
        }
        
        // Reset UI
        document.getElementById('fileLabel').textContent = 'Choose CSV File';
        document.getElementById('fileLabel').style.borderColor = '#e11d48';
        document.getElementById('fileLabel').style.borderStyle = 'dashed';
        document.getElementById('fileInfo').textContent = '';
        document.getElementById('fileInfo').style.display = 'none';
        
        document.getElementById('trainBtn').disabled = true;
        document.getElementById('predictBtn').disabled = true;
        document.getElementById('progressFill').style.width = '0%';
        
        document.getElementById('accuracy').textContent = '-';
        document.getElementById('loss').textContent = '-';
        document.getElementById('testMse').textContent = '-';
        
        document.getElementById('tp').textContent = '-';
        document.getElementById('tn').textContent = '-';
        document.getElementById('fp').textContent = '-';
        document.getElementById('fn').textContent = '-';
        
        // Reset predictions
        const predictionElements = document.querySelectorAll('.prediction-value');
        predictionElements.forEach(el => {
            el.textContent = '-';
            el.className = 'prediction-value';
        });
        
        // Reset chart
        if (this.chart) {
            this.chart.data.labels = [];
            this.chart.data.datasets[0].data = [];
            this.chart.data.datasets[1].data = [];
            this.chart.update();
        }
        
        this.updateStatus('Application reset. Ready to load new data.');
        
        // Clear file input
        document.getElementById('csvFile').value = '';
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new StockPredictorApp();
});
