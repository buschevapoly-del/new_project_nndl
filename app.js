// app.js
/**
 * Main Application Module
 * Handles UI interactions, visualizations, and coordinates between modules
 */

import { dataLoader } from './data-loader.js';
import { gruModel } from './gru.js';

class StockPredictorApp {
    constructor() {
        this.isDataLoaded = false;
        this.isModelTrained = false;
        this.currentFile = null;
        this.priceChart = null;
        this.performanceChart = null;
        this.predictions = [];
        
        this.initEventListeners();
        this.updateUI();
    }

    /**
     * Initialize event listeners for UI elements
     */
    initEventListeners() {
        // File upload
        const fileInput = document.getElementById('fileInput');
        const dropArea = document.getElementById('dropArea');
        const loadDataBtn = document.getElementById('loadDataBtn');
        const viewDataBtn = document.getElementById('viewDataBtn');
        const trainBtn = document.getElementById('trainBtn');
        const stopTrainBtn = document.getElementById('stopTrainBtn');
        const predictBtn = document.getElementById('predictBtn');

        // File selection
        dropArea.addEventListener('click', () => fileInput.click());
        
        fileInput.addEventListener('change', (e) => {
            this.currentFile = e.target.files[0];
            this.onFileSelected();
        });

        // Drag and drop
        dropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropArea.style.borderColor = '#f43f5e';
            dropArea.style.background = 'rgba(244, 63, 94, 0.05)';
        });

        dropArea.addEventListener('dragleave', () => {
            dropArea.style.borderColor = '#be123c';
            dropArea.style.background = '';
        });

        dropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dropArea.style.borderColor = '#be123c';
            dropArea.style.background = '';
            
            if (e.dataTransfer.files.length) {
                this.currentFile = e.dataTransfer.files[0];
                fileInput.files = e.dataTransfer.files;
                this.onFileSelected();
            }
        });

        // Button clicks
        loadDataBtn.addEventListener('click', () => this.loadAndPrepareData());
        viewDataBtn.addEventListener('click', () => this.showDataStats());
        trainBtn.addEventListener('click', () => this.trainModel());
        stopTrainBtn.addEventListener('click', () => this.stopTraining());
        predictBtn.addEventListener('click', () => this.makePredictions());
    }

    /**
     * Handle file selection
     */
    onFileSelected() {
        if (this.currentFile) {
            this.showStatus('info', `File selected: ${this.currentFile.name} (${Math.round(this.currentFile.size / 1024)} KB)`);
            
            const loadDataBtn = document.getElementById('loadDataBtn');
            loadDataBtn.disabled
