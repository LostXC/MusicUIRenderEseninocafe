FROM python:3.11-slim

# Install FFmpeg for video rendering
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the server script and frontend files
COPY . .

# Set default port to 8000, but allow it to be configured by the environment
ENV PORT=8000
EXPOSE $PORT

# Start the python server
CMD ["python", "server.py"]
