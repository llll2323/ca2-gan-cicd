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

    console.log("Width:", width, "Height:", height);
    console.log("Flat image data length:", flatData.length);
    console.log("Sample of image data:", flatData.slice(0, 10));

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