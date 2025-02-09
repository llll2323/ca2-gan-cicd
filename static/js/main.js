async function generateImage() {
    try {
        // Show loading indicator
        const loadingIndicator = document.getElementById('loading-indicator');
        loadingIndicator.classList.remove('hidden');
        
        // Generate a random vector of 100 numbers between -1 and 1
        const vector = Array.from({ length: 100 }, () => Math.random() * 2 - 1);

        // Create a batch of 100 identical vectors
        const batch = Array.from({ length: 100 }, () => vector);

        const response = await fetch('/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                signature_name: "serving_default",
                instances: batch
            })
        });

        const data = await response.json();

        if (data.status === 'success') {
            // Display vector
            document.getElementById('current-vector').textContent =
                JSON.stringify(data.vector, null, 2);
            
            // Display image
            const imageData = data.image[0];  // Get first image from predictions
            displayImage(imageData);
            
            // Add to history
            addToHistory(data);
        } else {
            alert('Error generating image: ' + data.message);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error generating image');
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
        // Ensure we're copying just the array, not the formatted string
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
        const vector = JSON.parse(text);
        
        // Validate vector: now expecting 100 numbers
        if (!Array.isArray(vector) || vector.length !== 100) {
            throw new Error('Invalid vector format. Must be array of 100 numbers.');
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
    
    // Create new table row
    const row = document.createElement('tr');
    
    // Format current date
    const currentDate = new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    // Create view button and URL display
    let viewButton = '';
    let urlDisplay = 'No URL available';
    let imageHtml = '';
    
    if (data.dropbox_url) {
        console.log('Dropbox URL found:', data.dropbox_url);
        urlDisplay = `<a href="${data.dropbox_url}" target="_blank" class="dropbox-link">${data.dropbox_url}</a>`;
        viewButton = `<button class="history-btn" onclick="(function(e) { 
            e.preventDefault(); 
            e.stopPropagation(); 
            window.open('${data.dropbox_url.replace(/'/g, "\\'")}', '_blank');
        })(event)">View</button>`;
        // Use the Dropbox image directly
        imageHtml = `<img src="${data.dropbox_url}" alt="Generated Image" style="width: 56px; height: 56px; image-rendering: pixelated;">`;
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
            <button class="history-btn delete-btn" onclick='deleteHistoryItem(${JSON.stringify(data.vector)}, this.parentElement.parentElement)'>Delete</button>
        </td>
    `;
    
    // Insert at the beginning of the history
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
    
    data.history.forEach(item => {
        console.log('Processing history item:', item);
        
        const row = document.createElement('tr');
        const date = new Date(item.date);
        const formattedDate = date.toLocaleString();
        
        // Create view button with proper event handling and logging
        let viewButton = '';
        let urlDisplay = 'No URL available';
        let imageHtml = '';
        
        if (item.dropbox_url) {
            console.log('Dropbox URL found:', item.dropbox_url);
            urlDisplay = `<a href="${item.dropbox_url}" target="_blank" class="dropbox-link">${item.dropbox_url}</a>`;
            viewButton = `<button class="history-btn" onclick="(function(e) { 
                e.preventDefault(); 
                e.stopPropagation(); 
                console.log('View button clicked for item:', ${item.id});
                console.log('Opening URL:', '${item.dropbox_url}');
                window.open('${item.dropbox_url.replace(/'/g, "\\'")}', '_blank');
            })(event)">View</button>`;
            // Use the Dropbox image directly
            imageHtml = `<img src="${item.dropbox_url}" alt="Generated Image" style="width: 56px; height: 56px; image-rendering: pixelated;">`;
        } else {
            console.log('No Dropbox URL for item:', item.id);
        }

        const vectorDisplay = JSON.stringify(item.vector).slice(0, 50) + '...';
            
        row.innerHTML = `
            <td>${formattedDate}</td>
            <td class="image-cell">${imageHtml}</td>
            <td class="info-display">
                <div style="margin-bottom: 5px;"><strong>Vector:</strong> ${vectorDisplay}</div>
                <div style="word-break: break-all;"><strong>URL:</strong> ${urlDisplay}</div>
            </td>
            <td class="action-cell">
                <button class="history-btn" onclick='copyHistoryVector(${JSON.stringify(item.vector)})'>Copy Vector</button>
                ${viewButton}
                <button class="history-btn delete-btn" onclick='deleteHistoryItem(${JSON.stringify(item.vector)}, this.parentElement.parentElement)'>Delete</button>
            </td>
        `;
        
        historyGrid.appendChild(row);
    });
}

async function deleteHistoryItem(vector, element) {
    try {
        const response = await fetch('/delete_history', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ vector: vector })
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
    // Vector is already an array, just stringify it
    navigator.clipboard.writeText(JSON.stringify(vector))
        .then(() => alert('Vector copied to clipboard!'))
        .catch(err => alert('Failed to copy vector: ' + err));
}