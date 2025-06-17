# Tmux Session Persistence Setup

CCManager Web now supports tmux for persistent terminal sessions that survive server restarts.

## Installation

### Ubuntu/Debian
```bash
sudo apt update
sudo apt install tmux
```

### macOS
```bash
brew install tmux
```

### RHEL/CentOS/Fedora
```bash
sudo yum install tmux
# or
sudo dnf install tmux
```

## How It Works

When tmux is available, CCManager Web will:

1. **Create tmux sessions** for each Claude session
   - Session names follow pattern: `ccmanager_sess_[id]`
   - Sessions run detached in background

2. **Persist across restarts**
   - Backend server can restart without killing sessions
   - Users can reconnect to existing sessions
   - Session output is preserved

3. **Automatic reconnection**
   - When user tries to interact with a session
   - CCManager automatically reattaches to tmux session
   - Seamless experience for users

## Managing Tmux Sessions

### List all CCManager sessions
```bash
tmux ls | grep ccmanager_
```

### Manually attach to a session
```bash
tmux attach -t ccmanager_sess_abc123
```

### Kill a specific session
```bash
tmux kill-session -t ccmanager_sess_abc123
```

### Kill all CCManager sessions
```bash
tmux ls | grep ccmanager_ | cut -d: -f1 | xargs -I {} tmux kill-session -t {}
```

## Configuration

Tmux is enabled by default when available. To disable:

```typescript
// In backend/src/services/sessionManager.ts
private useTmux = false; // Set to false to disable tmux
```

## Benefits

1. **Zero downtime deployments** - Update backend without losing sessions
2. **Crash recovery** - Sessions survive backend crashes
3. **Resource efficiency** - Tmux uses minimal resources
4. **Native terminal** - Full terminal compatibility
5. **Easy debugging** - Can attach to sessions manually

## Limitations

1. **Single server only** - Tmux sessions are local to one machine
2. **No load balancing** - Can't distribute sessions across servers
3. **Manual cleanup** - Dead sessions need manual removal

## Troubleshooting

### Sessions not persisting
```bash
# Check if tmux is installed
which tmux

# Check tmux version (need 1.8+)
tmux -V

# Check if tmux server is running
tmux ls
```

### Permission issues
```bash
# Ensure user can create tmux sessions
# Add to sudoers if needed for system-wide tmux
```

### Session cleanup script
```bash
#!/bin/bash
# cleanup-tmux-sessions.sh
# Run via cron to clean up old sessions

# Kill sessions older than 7 days
tmux ls -F '#{session_name}:#{session_created}' | while read line; do
  name=$(echo $line | cut -d: -f1)
  created=$(echo $line | cut -d: -f2)
  age=$(($(date +%s) - created))
  if [[ $name == ccmanager_* ]] && [ $age -gt 604800 ]; then
    tmux kill-session -t "$name"
  fi
done
```

## Comparison with Alternatives

| Feature | Tmux | Screen | Docker | Direct PTY |
|---------|------|--------|--------|------------|
| Persistence | ✓ | ✓ | ✓ | ✗ |
| Resource Usage | Low | Low | High | Minimal |
| Complexity | Low | Low | High | None |
| Multi-server | ✗ | ✗ | ✓ | ✗ |
| Setup Time | 1 min | 1 min | 30 min | 0 min |

## Monitoring

Check session health:
```bash
# Count active sessions
tmux ls | grep ccmanager_ | wc -l

# Check session ages
tmux ls -F '#{session_name}:#{session_created}' | grep ccmanager_
```

## Best Practices

1. **Regular cleanup** - Set up cron job to remove old sessions
2. **Monitor disk space** - Tmux stores scrollback buffer
3. **Set resource limits** - Use systemd or ulimits
4. **Log rotation** - Ensure logs don't fill disk
5. **Health checks** - Monitor tmux server status