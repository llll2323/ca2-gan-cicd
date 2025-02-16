async function generateImage() {
    try {
        // Show loading indicator
        const loadingIndicator = document.getElementById('loading-indicator');
        loadingIndicator.classList.remove('hidden');
        
        const response = await fetch('/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        console.log('Server response:', data); // Debug log

        if (data.status === 'success') {
            // Display vector if available
            if (data.vector) {
                document.getElementById('current-vector').textContent =
                    JSON.stringify(data.vector, null, 2);
            }
            
            // Display image from S3 URL
            if (data.s3_url) {
                const imageContainer = document.getElementById('generated-image');
                const img = new Image();
                img.src = data.s3_url;
                img.alt = "Generated Image";
                img.onerror = () => {
                    console.error('Failed to load image from:', data.s3_url);
                    alert('Failed to load image');
                };
                imageContainer.innerHTML = '';
                imageContainer.appendChild(img);
                
                // Add to history
                addToHistory(data);
            } else {
                throw new Error('No URL in response');
            }
        } else {
            throw new Error(data.message || 'Generation failed');
        }
    } catch (error) {
        console.error('Generation error:', error);
        alert('Error generating image: ' + error.message);
    } finally {
        // Hide loading indicator
        const loadingIndicator = document.getElementById('loading-indicator');
        loadingIndicator.classList.add('hidden');
    }
}

function displayImage(imageData) {
    let width, height, flatData;
    
    // Check if imageData is nested (2D array)
    if (Array.isArray(imageData[0])) {
        height = imageData.length;       // e.g., 28 rows
        width = imageData[0].length;     // e.g., 28 columns
        flatData = imageData.flat();     // Flatten to a 1D array of 784 elements
    } else {
        flatData = imageData;
        const size = Math.sqrt(flatData.length);
        width = size;
        height = size;
    }

    // console.log("Width:", width, "Height:", height);
    // console.log("Flat image data length:", flatData.length);
    // console.log("Sample of image data:", flatData.slice(0, 10));

    // Create a canvas with the determined dimensions
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageDataObj = ctx.createImageData(width, height);
    
    // Fill image data: loop over all pixel values
    for (let i = 0; i < flatData.length; i++) {
        // Double the brightness by using * 255 instead of * 255/2
        const pixelValue = Math.round((flatData[i] + 1) * 255);
        // Ensure value is in valid range
        const clampedValue = Math.max(0, Math.min(255, pixelValue));
        
        imageDataObj.data[i * 4] = clampedValue;     // R
        imageDataObj.data[i * 4 + 1] = clampedValue; // G
        imageDataObj.data[i * 4 + 2] = clampedValue; // B
        imageDataObj.data[i * 4 + 3] = 255;          // A (fully opaque)
    }
    
    ctx.putImageData(imageDataObj, 0, 0);
    
    // Scale up the image for display
    const scaleFactor = 10;
    const displayCanvas = document.createElement('canvas');
    displayCanvas.width = width * scaleFactor;
    displayCanvas.height = height * scaleFactor;
    const displayCtx = displayCanvas.getContext('2d');
    displayCtx.imageSmoothingEnabled = false;  // Keep pixels sharp
    displayCtx.drawImage(canvas, 0, 0, displayCanvas.width, displayCanvas.height);
    
    // Display in the image area
    const imageDisplay = document.getElementById('generated-image');
    imageDisplay.innerHTML = '';
    imageDisplay.appendChild(displayCanvas);
}

function copyVector() {
    const vector = document.getElementById('current-vector').textContent;
    if (vector) {
        try {
            const vectorData = JSON.parse(vector);
            navigator.clipboard.writeText(JSON.stringify(vectorData))
                .then(() => alert('Vector copied to clipboard!'))
                .catch(err => alert('Failed to copy vector: ' + err));
        } catch (err) {
            alert('Error processing vector data');
        }
    } else {
        alert('No vector to copy. Generate an image first!');
    }
}

async function pasteAndGenerate() {
    try {
        const text = await navigator.clipboard.readText();
        console.log('Pasted text:', text); // Debug log to check clipboard content
        let vector = JSON.parse(text);
        
        // Validate vector: now expecting 100 numbers
        if (!Array.isArray(vector) || vector.length !== 100) {
            // If it's a nested array, try to use the inner array
            if (Array.isArray(vector) && vector.length === 1 && Array.isArray(vector[0]) && vector[0].length === 100) {
                vector = vector[0];
            } else {
                console.error('Validation failed:', vector);
                throw new Error('Invalid vector format. Must be array of 100 numbers.');
            }
        }

        const batch = [vector];

        // Send to server
        const response = await fetch('/generate_from_vector', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                signature_name: "serving_default",
                instances: batch
            })              
        });
        
        const data = await response.json();
        if (data.status === 'success') {
            document.getElementById('current-vector').textContent =
                JSON.stringify(data.vector, null, 2);
            displayImage(data.image[0]);
            addToHistory(data);
        } else {
            alert('Error generating image: ' + data.message);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error pasting vector: ' + error.message);
    }
}

function extractImageInfo(imageData) {
    let width, height, flatData;

    // Handle undefined or null data
    if (!imageData) {
        console.error('No image data provided');
        return { width: 28, height: 28, flatData: new Array(784).fill(0) };
    }

    // Check if imageData is nested (2D array)
    if (Array.isArray(imageData) && Array.isArray(imageData[0])) {
        height = imageData.length;
        width = imageData[0].length;
        flatData = imageData.flat();
    } else if (Array.isArray(imageData)) {
        // Handle 1D array
        flatData = imageData;
        const size = Math.sqrt(flatData.length);
        width = size;
        height = size;
    } else {
        console.error('Invalid image data format:', imageData);
        return { width: 28, height: 28, flatData: new Array(784).fill(-1) }; // Default to black
    }

    // Normalize the data to ensure values are between -1 and 1
    flatData = flatData.map(val => {
        if (val > 1) return val / 255 * 2 - 1;
        return val;
    });

    return { width, height, flatData };
}

function addToHistory(data) {
    const historyGrid = document.getElementById('history-grid');
    
    const row = document.createElement('tr');
    
    const currentDate = new Date().toLocaleString();

    let viewButton = '';
    let urlDisplay = 'No URL available';
    let imageHtml = '';
    
    if (data.s3_url) {
        urlDisplay = `<a href="${data.s3_url}" target="_blank" class="s3-link">${data.s3_url}</a>`;
        viewButton = `<button class="history-btn" onclick="window.open('${data.s3_url}', '_blank')">View</button>`;
        imageHtml = `<img src="${data.s3_url}" alt="Generated Image" style="width: 56px; height: 56px; image-rendering: pixelated;">`;
    }

    const vectorDisplay = JSON.stringify(data.vector).slice(0, 50) + '...';

    row.innerHTML = `
        <td>${currentDate}</td>
        <td class="image-cell">${imageHtml}</td>
        <td class="info-display">
            <div style="margin-bottom: 5px;"><strong>Vector:</strong> ${vectorDisplay}</div>
            <div style="word-break: break-all;"><strong>URL:</strong> ${urlDisplay}</div>
        </td>
        <td class="action-cell">
            <button class="history-btn" onclick='copyHistoryVector(${JSON.stringify(data.vector)})'>Copy Vector</button>
            ${viewButton}
            <button class="history-btn delete-btn" onclick='deleteHistoryItem(${data.id || "null"}, this.closest("tr"))'>Delete</button>
        </td>
    `;
    
    if (historyGrid.firstChild) {
        historyGrid.insertBefore(row, historyGrid.firstChild);
    } else {
        historyGrid.appendChild(row);
    }
}

// Add event listener for search type change
document.getElementById('search-type').addEventListener('change', function(e) {
    const similarityControl = document.getElementById('similarity-control');
    similarityControl.classList.toggle('hidden', e.target.value !== 'similar');
});

// Add event listener for threshold change
document.getElementById('similarity-threshold').addEventListener('input', function(e) {
    document.getElementById('threshold-value').textContent = e.target.value;
});


// Update performSearch function to include threshold
function performSearch() {
    const searchVector = document.getElementById('vector-search').value.trim();
    const searchType = document.getElementById('search-type').value;
    const threshold = document.getElementById('similarity-threshold').value / 100; // Convert to decimal
    
    try {
        let params;
        
        if (searchVector === '') {
            params = new URLSearchParams({
                page: 1,
                date_from: document.getElementById('date-from').value,
                date_to: document.getElementById('date-to').value
            });
        } else {
            const vectorData = JSON.parse(searchVector);
            
            if (!Array.isArray(vectorData) || vectorData.length !== 100) {
                alert('Please paste a valid vector with 100 dimensions');
                return;
            }
            
            params = new URLSearchParams({
                search_type: searchType,
                search_vector: JSON.stringify(vectorData),
                threshold: threshold,
                date_from: document.getElementById('date-from').value,
                date_to: document.getElementById('date-to').value,
                page: 1
            });
        }

        fetch(`/history?${params}`)
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    updateHistoryDisplay(data);
                } else {
                    alert('Error loading history: ' + data.message);
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Error loading history. Please try again.');
            });
    } catch (e) {
        console.error('Parse error:', e);
        alert('Please paste a valid JSON vector');
    }
}

// Add this at the top of the file, after other function definitions
document.addEventListener('DOMContentLoaded', function() {
    // Load history when page loads
    loadHistory(1);
});

async function loadHistory(page, search = '', dateFrom = '', dateTo = '') {
    try {
        const params = new URLSearchParams({
            page: page,
            search: search,
            date_from: dateFrom,
            date_to: dateTo
        });

        const response = await fetch(`/history?${params}`);
        const data = await response.json();
        
        if (data.status === 'success') {
            updateHistoryDisplay(data);
        } else {
            console.error('Error loading history:', data.message);
        }
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

function updateHistoryDisplay(data) {
    const historyGrid = document.getElementById('history-grid');
    historyGrid.innerHTML = '';

    // Remove the reverse since data is already in correct order
    data.history.forEach(item => {
        const row = document.createElement('tr');
        
        const dateCell = document.createElement('td');
        dateCell.textContent = new Date(item.date).toLocaleString();
        
        const imageCell = document.createElement('td');
        imageCell.classList.add('image-cell');
        imageCell.innerHTML = `<img src="${item.s3_url}" alt="Generated Image" style="width: 56px; height: 56px; image-rendering: pixelated;">`;
        
        const vectorCell = document.createElement('td');
        vectorCell.classList.add('info-display');
        vectorCell.innerHTML = `
            <div style="margin-bottom: 5px;"><strong>Vector:</strong> ${JSON.stringify(item.vector).slice(0, 50)}...</div>
            <div style="word-break: break-all;"><strong>URL:</strong> <a href="${item.s3_url}" target="_blank" class="s3-link">${item.s3_url}</a></div>
        `;
        
        const actionCell = document.createElement('td');
        actionCell.classList.add('action-cell');
        actionCell.innerHTML = `
            <button class="history-btn" onclick='copyHistoryVector(${JSON.stringify(item.vector)})'>Copy Vector</button>
            <button class="history-btn" onclick="window.open('${item.s3_url}', '_blank')">View</button>
            <button class="history-btn delete-btn" onclick='deleteHistoryItem(${item.id}, this.closest("tr"))'>Delete</button>
        `;
        
        row.appendChild(dateCell);
        row.appendChild(imageCell);
        row.appendChild(vectorCell);
        row.appendChild(actionCell);
        
        historyGrid.appendChild(row);
    });
}

async function deleteHistoryItem(id, element) {
    try {
        const response = await fetch('/delete_history', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id: id })
        });

        const data = await response.json();
        if (data.status === 'success') {
            element.remove();
        } else {
            alert('Error deleting history item: ' + data.message);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error deleting history item');
    }
}

function downloadHistoryItem(item) {
    // Create a temporary canvas to draw the image
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size to be larger for better quality
    canvas.width = 280;  // 10x original size
    canvas.height = 280;
    
    // Extract image data
    const { width, height, flatData } = extractImageInfo(item.image);
    
    // Create scaled image data
    const scaledImageData = ctx.createImageData(canvas.width, canvas.height);
    const scale = canvas.width / width;
    
    // Fill scaled image data
    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const sourceX = Math.floor(x / scale);
            const sourceY = Math.floor(y / scale);
            const sourceIndex = sourceY * width + sourceX;
            const targetIndex = (y * canvas.width + x) * 4;
            
            // Double the brightness by using * 255 instead of * 255/2
            const pixelValue = Math.round((flatData[sourceIndex] + 1) * 255);
            // Ensure value is in valid range
            const clampedValue = Math.max(0, Math.min(255, pixelValue));
            
            scaledImageData.data[targetIndex] = clampedValue;     // R
            scaledImageData.data[targetIndex + 1] = clampedValue; // G
            scaledImageData.data[targetIndex + 2] = clampedValue; // B
            scaledImageData.data[targetIndex + 3] = 255;          // A
        }
    }
    
    // Put the image data on the canvas
    ctx.putImageData(scaledImageData, 0, 0);
    
    // Create download link
    const date = new Date(item.date);
    const filename = `gan_image_${date.toISOString().split('.')[0].replace(/[:]/g, '-')}.jpg`;
    
    // Convert canvas to blob and download
    canvas.toBlob((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }, 'image/jpeg', 0.95); // 0.95 is the JPEG quality
}

function copyHistoryVector(vector) {
    const vectorStr = JSON.stringify(vector);
    navigator.clipboard.writeText(vectorStr)
        .then(() => {
            alert('Vector copied to clipboard!');
        })
        .catch(err => {
            console.error('Failed to copy:', err);
            alert('Failed to copy vector');
        });
}