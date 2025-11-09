# Vultr Server Fix Guide

## Step 1: SSH into your Vultr server

```bash
ssh root@144.202.0.231
```

## Step 2: Check if the server process is running

```bash
ps aux | grep uvicorn
```

**If you see a process running:**

- Note the PID (first number)
- Check if it's listening on port 8000: `sudo netstat -tlnp | grep 8000` or `sudo ss -tlnp | grep 8000`

**If NO process is running:**

- The server crashed or was stopped
- Continue to Step 3

## Step 3: Check firewall status

```bash
sudo ufw status numbered
```

**Make sure port 8000 is open:**

```bash
sudo ufw allow 8000/tcp
sudo ufw reload
sudo ufw status
```

## Step 4: Navigate to server directory and restart

```bash
cd /path/to/HackUmass13/server  # Adjust path as needed
source .venv/bin/activate  # Activate virtual environment

# Kill any existing processes on port 8000
sudo lsof -ti:8000 | xargs sudo kill -9 2>/dev/null || true

# Start the server
MPLCONFIGDIR=.mpl YOLO_CONFIG_DIR=.yolo uvicorn main:app --host 0.0.0.0 --port 8000
```

## Step 5: Test from Vultr server itself

```bash
curl http://localhost:8000/healthz
```

**If this works**, the server is running but may have firewall issues.

## Step 6: Test from your Mac

```bash
curl http://144.202.0.231:8000/healthz
```

## Step 7: Run server in background (optional)

If you want the server to keep running after you disconnect:

```bash
# Using nohup
nohup MPLCONFIGDIR=.mpl YOLO_CONFIG_DIR=.yolo uvicorn main:app --host 0.0.0.0 --port 8000 > server.log 2>&1 &

# Or using screen
screen -S server
# Then run: MPLCONFIGDIR=.mpl YOLO_CONFIG_DIR=.yolo uvicorn main:app --host 0.0.0.0 --port 8000
# Press Ctrl+A then D to detach
```

## Common Issues:

1. **Port 8000 already in use:**

   ```bash
   sudo lsof -ti:8000 | xargs sudo kill -9
   ```

2. **Firewall blocking:**

   ```bash
   sudo ufw allow 8000/tcp
   sudo ufw reload
   ```

3. **Server crashed due to memory:**

   - Check logs: `tail -f server.log` or check system logs
   - May need to reduce model size or increase server RAM

4. **Python dependencies missing:**
   ```bash
   cd /path/to/server
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

## Quick Test Script (run on Vultr):

```bash
#!/bin/bash
echo "=== Checking Vultr Server ==="
echo "1. Process check:"
ps aux | grep uvicorn | grep -v grep || echo "No uvicorn process found"
echo ""
echo "2. Port check:"
sudo netstat -tlnp | grep 8000 || sudo ss -tlnp | grep 8000 || echo "Port 8000 not listening"
echo ""
echo "3. Firewall check:"
sudo ufw status | grep 8000 || echo "Port 8000 not in firewall rules"
echo ""
echo "4. Local test:"
curl -s http://localhost:8000/healthz || echo "Local connection failed"
```
