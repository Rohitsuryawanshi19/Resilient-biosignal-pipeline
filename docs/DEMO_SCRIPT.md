# Demonstration Video Script (<= 5 Minutes)

**Total Duration**: 4 minutes 45 seconds  
**Objective**: Demonstrate production readiness, zero-data-loss durability, autonomous failure recovery, and systems engineering rigor to a technical interviewer or recruiter.

---

### Phase 1: Ingest & Status Inspection (0:00 – 0:45)
- **Visual**: Split screen. Left terminal: Pi 4 SSH session running the daemon. Right terminal: CLI status query and `systemctl`.
- **Narration**:
  > *"Welcome. This is the MayaCardio biosignal streaming pipeline running directly on a Raspberry Pi 4. The daemon is actively ingesting 400 Hz ECG and PPG data across 5 channels over raw TCP. Let's inspect the daemon status."*
- **Action**:
  ```bash
  pipeline status
  ```
- **Observed Output**:
  ```json
  {"mode":"online","session_id":"sess-prod-01","samples_saved":12400,"samples_in_cloud":12400,"backlog":0}
  ```
- **Narration**:
  > *"Notice that status emits exactly one line of JSON for automated health monitoring. Samples saved matches samples in cloud, backlog is 0, and the daemon is consuming under 3% CPU and 48 MB RAM."*

---

### Phase 2: Network Chaos & Autonomous Mode Switch (0:45 – 1:45)
- **Visual**: Terminal showing live pipeline log stream alongside browser dashboard.
- **Narration**:
  > *"Now we inject network failure. Using our non-invasive proxy or an iptables rule, we sever communication between the Raspberry Pi and the Cloudflare Worker."*
- **Action**:
  ```bash
  # Cut network route to cloud
  sudo iptables -A OUTPUT -p tcp --dport 443 -j DROP
  ```
- **Visual**: Terminal logs two missed acks. Mode flips from `online` to `offline` in 1.1 seconds.
- **Narration**:
  > *"Within 1.1 seconds—well within our 10-second hard bound—the monotonic mode controller detects missed acks and flips to offline mode. The UI immediately reflects this with an amber offline banner. Crucially, the local SQLite WAL continues ingesting at 400 Hz with zero dropped samples, queueing unacknowledged blocks."*
- **Action**:
  ```bash
  pipeline status
  ```
- **Observed Output**:
  ```json
  {"mode":"offline","session_id":"sess-prod-01","samples_saved":16800,"samples_in_cloud":12400,"backlog":4400}
  ```

---

### Phase 3: Crash Hard-Kill (`kill -9`) & Auto-Recovery (1:45 – 2:40)
- **Visual**: Terminal with daemon running under heavy fsync WAL writes.
- **Narration**:
  > *"What happens during an abrupt process crash? We fire SIGKILL directly at the daemon process."*
- **Action**:
  ```bash
  sudo killall -9 pipeline
  ```
- **Narration**:
  > *"The process terminates instantly mid-transaction. Now we restart the pipeline via systemd or CLI."*
- **Action**:
  ```bash
  sudo systemctl restart pipeline.service
  pipeline audit
  ```
- **Observed Output**:
  ```
  Session: sess-prod-01 | Sensor: 1 | Stored: 16800 | Lost: 0 | Gaps: 0 | Overlaps: 0 | Status: OK
  Session: sess-prod-01 | Sensor: 2 | Stored: 16800 | Lost: 0 | Gaps: 0 | Overlaps: 0 | Status: OK
  ```
- **Narration**:
  > *"On boot, SQLite WAL automatically replays durable log records. The auditor confirms zero corruptions, zero overlaps, and zero unexplained gaps. The accounting identity `stored ∩ lost = ∅` holds perfectly."*

---

### Phase 4: Network Restoration & Catch-Up (2:40 – 3:45)
- **Visual**: Terminal running network restore command; browser dashboard showing ledger tile strip.
- **Narration**:
  > *"Now we restore network connectivity to Cloudflare."*
- **Action**:
  ```bash
  sudo iptables -D OUTPUT -p tcp --dport 443 -j DROP
  ```
- **Narration**:
  > *"Notice the 2-ack hysteresis: the pipeline requires two consecutive successful acknowledgments before transitioning back to online mode to prevent network flapping. Immediately upon connection, the two-lane sync client queries the cloud for missing intervals (`local_stored - cloud_has`). Watch the backlog catch-up in real time."*
- **Visual**: Backlog drops from 4,400 to 0 in under 2 seconds. The browser's Ledger Tiling strip transitions tiles from blue (pending sync) to mint (cloud stored).
- **Action**:
  ```bash
  bun run tools/chaos/src/verifier.ts --session sess-prod-01
  ```
- **Observed Output**:
  ```
  Verified 16,800 samples against ground truth ramp formula.
  Corruptions: 0 | Gaps: 0 | Status: 100% MATCH
  ```

---

### Phase 5: Dashboard Walkthrough & Proof Panel (3:45 – 4:45)
- **Visual**: Browser at `http://localhost:3000` (or Cloudflare Worker URL) showing the full Spatial Neumorphic Glass dashboard.
- **Narration**:
  > *"Finally, let's examine the web interface served directly from the edge Worker:
  > 1. Top Hero: Live status chip and count-up telemetry.
  > 2. Live ECG Canvas: 60 fps scrolling waveform of Sensor 1 Channel 2, displaying green glowing dots on detected peaks with a smoothly tweened BPM readout.
  > 3. Ledger Tiling Bar: The signature visualization showing device vs cloud lanes side-by-side. Every tile is interactive—hovering displays the exact interval range and honest loss reason.
  > 4. Proof Panel: Directly displays the 8 engineering completion criteria with live measured values and links to verified evidence files.
  > 5. Resource Dials: 2.8% CPU and 48 MB RAM, demonstrating our strict O(1) memory guarantees.
  >
  > Everything you see traces directly to real SQLite transactions and verified mathematical formulas. Thank you."*
