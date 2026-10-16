# Timeline Event Schema (docs/EVENT_SCHEMA.md)

This schema defines the format of `evidence/timeline.json` recording real failure-injection scenarios for automated replay in the frontend UI.

## File Structure

```json
{
  "version": "1.0.0",
  "sessionId": "string",
  "generatedAt": "ISO-8601 string",
  "events": [
    {
      "id": "string",
      "type": "network_cut | mode_switch | process_kill | power_cut | recovery | catchup_done",
      "timestampMono": 123456.78,
      "details": {}
    }
  ]
}
```

## Event Types & Payloads

### 1. `network_cut`
Emitted when network connectivity to cloud or mock is interrupted.
```json
{
  "id": "evt-1",
  "type": "network_cut",
  "timestampMono": 1234.5,
  "details": {
    "target": "cloud",
    "mechanism": "iptables_drop | socket_disconnect"
  }
}
```

### 2. `mode_switch`
Emitted when device mode controller transitions between modes.
```json
{
  "id": "evt-2",
  "type": "mode_switch",
  "timestampMono": 1244.2,
  "details": {
    "from": "online",
    "to": "offline",
    "trigger": "ack_timeout_4s"
  }
}
```

### 3. `process_kill`
Emitted when daemon process is terminated abruptly.
```json
{
  "id": "evt-3",
  "type": "process_kill",
  "timestampMono": 2100.0,
  "details": {
    "signal": "SIGKILL",
    "targetPid": 4512
  }
}
```

### 4. `power_cut`
Emitted when power is simulated or pulled.
```json
{
  "id": "evt-4",
  "type": "power_cut",
  "timestampMono": 3500.0,
  "details": {
    "simulation": "qemu_sigkill | real_board_pull",
    "downtimeSeconds": 15
  }
}
```

### 5. `recovery`
Emitted when daemon restarts or network link recovers.
```json
{
  "id": "evt-5",
  "type": "recovery",
  "timestampMono": 3515.2,
  "details": {
    "source": "daemon_restart | network_restore",
    "resumedIndex": 12000
  }
}
```

### 6. `catchup_done`
Emitted when backlog synchronization to cloud completes.
```json
{
  "id": "evt-6",
  "type": "catchup_done",
  "timestampMono": 3540.8,
  "details": {
    "blocksSynced": 1200,
    "lossesSynced": 2,
    "durationMs": 25600
  }
}
```
