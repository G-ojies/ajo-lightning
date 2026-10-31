#!/usr/bin/env python3
"""Publish one circle's signed events to public Nostr relays, then read each one back.

Usage: scripts/publish-relays.py <circle-id> [base-url]
Published events cannot be recalled and they include member names, so only use this on a demo circle.
"""
import asyncio, json, sys, urllib.request
import websockets

RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net']

async def publish(relay, events):
    accepted, found = 0, set()
    try:
        async with websockets.connect(relay, open_timeout=15) as ws:
            for e in events:
                await asyncio.sleep(0.25)
                await ws.send(json.dumps(['EVENT', e]))
                while True:
                    m = json.loads(await asyncio.wait_for(ws.recv(), 15))
                    if m[0] == 'OK' and m[1] == e['id']:
                        accepted += bool(m[2])
                        if not m[2]: print(relay, 'refused', m[3])
                        break
            await ws.send(json.dumps(['REQ', 'ajo', {'ids': [e['id'] for e in events]}]))
            while True:
                m = json.loads(await asyncio.wait_for(ws.recv(), 15))
                if m[0] == 'EVENT': found.add(m[2]['id'])
                if m[0] == 'EOSE': break
    except Exception as err:
        print(relay, 'failed:', repr(err)[:120])
    print(f'{relay}: accepted {accepted}/{len(events)}, read back {len(found)}/{len(events)}')

async def main():
    cid = sys.argv[1]
    base = sys.argv[2] if len(sys.argv) > 2 else 'https://ajo-lightning.vercel.app'
    req = urllib.request.Request(f'{base}/api/circles/{cid}/events', headers={'User-Agent': 'ajo-publisher'})
    events = json.load(urllib.request.urlopen(req, timeout=30))['events']
    await asyncio.gather(*(publish(r, events) for r in RELAYS))
    print('first event id', events[0]['id'])

asyncio.run(main())
