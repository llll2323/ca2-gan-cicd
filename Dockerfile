# Use official Python image as the base
FROM python:3.8

# Set the working directory
WORKDIR /app

# Copy all project files into the container
COPY . /app

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt && pip list

# Expose port 5000 for Flask
EXPOSE 5000

# Command to start Flask server
CMD ["gunicorn", "-c", "gunicorn_config.py", "app:app"]