"""
Simulate a full dispense session without hardware.

Requires Flask running on localhost:5000. Replays Arduino push + UDP weight
events for the Tacos al Pastor recipe so you can test the SSE UI path.

Run: python simulate.py
"""

import socket, json, time, requests

BASE = 'http://localhost:5000'
UDP_IP = '127.0.0.1'
UDP_PORT = 5001

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

# Tacos al Pastor recipe from seed_recipes.py
spices = [
    {"slot": 1, "name": "Cumin",        "target": 2.0},
    {"slot": 2, "name": "Paprika",       "target": 1.5},
    {"slot": 3, "name": "Garlic Powder", "target": 0.8},
    {"slot": 4, "name": "Salt",          "target": 2.0},
    {"slot": 5, "name": "Oregano",       "target": 0.5},
    {"slot": 6, "name": "Onion Powder",  "target": 0.8},
    {"slot": 7, "name": "Black Pepper",  "target": 0.3},
    {"slot": 8, "name": "Cayenne",       "target": 0.5},
]

total_slots = len(spices)
recipe_name = "Tacos al Pastor"

print(f"--- Simulating: {recipe_name} ---")
print(f"--- {total_slots} spices total ---")
print()

for idx, spice in enumerate(spices):
    slot = spice["slot"]
    name = spice["name"]
    target = spice["target"]
    steps = max(10, int(target / 0.125))  # ~10 udp updates per gram

    print(f"[{idx+1}/{total_slots}] {name} -- target {target}g")

    # indexing
    print(f"  → indexing to slot {slot}")
    requests.post(f'{BASE}/api/arduino/indexing', json={
        'slot': slot,
        'spice_name': name,
        'slot_index': idx,
        'total_slots': total_slots
    })
    time.sleep(1.2)  # simulate carousel rotation

    # nearly there
    print(f"  → nearly there")
    requests.post(f'{BASE}/api/arduino/nearly-there', json={
        'slot': slot,
        'spice_name': name
    })
    time.sleep(0.8)  # simulate settle delay

    # dispense start
    print(f"  → dispense start")
    requests.post(f'{BASE}/api/arduino/dispense-start', json={
        'slot': slot,
        'spice_name': name,
        'target_weight': target,
        'slot_index': idx,
        'total_slots': total_slots
    })
    time.sleep(0.3)

    # UDP weight updates
    print(f"  → sending UDP weight updates")
    for i in range(steps + 1):
        current = round((i / steps) * target, 2)
        payload = json.dumps({
            'slot': slot,
            'current_weight': current,
            'target_weight': target
        })
        sock.sendto(payload.encode(), (UDP_IP, UDP_PORT))
        print(f"     UDP: {current}g / {target}g")
        time.sleep(0.15)

    time.sleep(0.4)  # settle

    # spice complete
    print(f"  → spice complete")
    requests.post(f'{BASE}/api/arduino/spice-complete', json={
        'slot': slot,
        'spice_name': name,
        'actual': target,
        'target': target,
        'status': 'done',
        'slot_index': idx
    })
    time.sleep(0.5)
    print()

# session complete
print("--- Session complete ---")
requests.post(f'{BASE}/api/arduino/session-complete', json={
    'recipe_name': recipe_name
})

sock.close()
print("--- Done ---")