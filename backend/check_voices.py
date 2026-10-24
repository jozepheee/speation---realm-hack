import os, httpx, asyncio
from dotenv import load_dotenv
load_dotenv('.env')
key = os.getenv('ELEVENLABS_API_KEY')

async def test():
    headers = {'xi-api-key': key}
    async with httpx.AsyncClient() as client:
        res = await client.get('https://api.elevenlabs.io/v1/voices', headers=headers)
        data = res.json()
        voices = data.get('voices', [])
        print(f"Total voices: {len(voices)}")
        for v in voices:
            labels = v.get('labels', {})
            gender = labels.get('gender', 'unknown')
            print(f"ID: {v['voice_id']} | Name: {v['name']} | Gender: {gender}")

asyncio.run(test())
