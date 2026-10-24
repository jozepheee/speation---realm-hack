import random
import urllib.parse
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
from config import settings

router = APIRouter(tags=["secondstep"])

class SpeechProcessRequest(BaseModel):
    text: str
    scenario_prompt: str

SCENARIOS = [
    {
        "prompt": "A warm, sunlit park with children playing catch with a golden retriever near a gentle fountain.",
        "query": "golden retriever playing catch children sunny park fountain",
        "hint": "Look at the animals, people, and the outdoor park surroundings."
    },
    {
        "prompt": "A busy kitchen bakery counter with freshly baked golden croissants, warm bread loaves, and steaming coffee.",
        "query": "freshly baked croissants artisan bread bakery morning light",
        "hint": "Notice the baked goods on display, the counter, and the cozy morning setting."
    },
    {
        "prompt": "A peaceful mountain lake reflecting snow-capped peaks under clear blue morning skies with wooden canoes.",
        "query": "clear mountain lake snow peaks wooden canoe reflection",
        "hint": "Observe the natural scenery, water reflections, and any boats."
    },
    {
        "prompt": "A vibrant community garden filled with blooming red tomatoes, sunflowers, and green leafy herbs.",
        "query": "vibrant community vegetable garden blooming tomatoes sunflowers",
        "hint": "Pay attention to the plants, fresh vegetables, and colorful flowers."
    },
    {
        "prompt": "A cozy neighborhood library with wooden bookshelves, comfortable armchairs, and warm reading lamps.",
        "query": "cozy library wooden bookshelves comfortable reading lamp",
        "hint": "Notice the quiet indoor room, furniture, and reading materials."
    },
    {
        "prompt": "A lively seaside harbor with colorful fishing boats docked along a wooden pier under sunset skies.",
        "query": "seaside harbor docked fishing boats wooden pier sunset",
        "hint": "Observe the coastal water, boats, and the warm sunset colors."
    },
    {
        "prompt": "A bright modern art studio with paintbrushes, colorful canvas paintings on easels, and ceramic pottery.",
        "query": "art studio colorful canvas easels paintbrushes pottery bright",
        "hint": "Look at the creative art tools, paintings, and studio workspace."
    },
    {
        "prompt": "A bustling farmer's market stall with fresh apples, baskets of berries, and cheerful handwritten signs.",
        "query": "farmers market stall fresh fruits berries baskets wooden crates",
        "hint": "Observe the fresh fruits, market stall setup, and produce containers."
    }
]

@router.get("/generate-image/")
async def generate_scenario_image():
    """
    Generates a realistic clinical language expression scenario with a visual image.
    Uses real dynamic AI image generation via Pollinations AI.
    Returns the image URL, hidden ground-truth prompt for the backend evaluator, and an open-ended clinical hint.
    """
    try:
        scenario = random.choice(SCENARIOS)
        encoded_prompt = urllib.parse.quote(scenario["query"])
        image_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=800&height=500&nologo=true"

        return {
            "image_url": image_url,
            "scenario_prompt": scenario["prompt"],
            "hint": scenario.get("hint", "Observe the main subjects, setting, and details in the scene.")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate scenario image: {str(e)}")

@router.post("/process-text/")
async def process_speech_text(payload: SpeechProcessRequest):
    """
    Analyzes patient's expressive spoken narrative against the hidden scenario using OpenRouter GPT-4o-mini.
    Computes clinical articulation score, vocabulary richness, and provides corrected grammar.
    """
    try:
        system_prompt = (
            "You are an expert clinical speech-language pathologist evaluating expressive language and visual scene description skills.\n"
            "The learner was shown an image generated from this ground-truth scene description (kept hidden from the learner):\n"
            f"Ground-Truth Scene Context: {payload.scenario_prompt}\n\n"
            f"Learner's Spoken Description: \"{payload.text}\"\n\n"
            "Evaluate their spoken response for:\n"
            "1. Scene Relevance & Visual Grounding: Did they identify key subjects, setting, or actions in the scene?\n"
            "2. Expressive Syntactic Fluency: Are the sentences grammatically sound and structured?\n"
            "3. Vocabulary Depth: Did they use descriptive nouns and adjectives?\n\n"
            "Provide constructive feedback in strictly valid JSON format with three fields:\n"
            "1. 'corrected': A fluent, grammatically polished, and natural version of what they expressed (1-2 sentences), keeping their intended meaning.\n"
            "2. 'score': An integer score between 50 and 100 based on syntax, relevance, and clarity.\n"
            "3. 'notes': 1 encouraging, actionable clinical SLP observation for the learner.\n"
            "Do NOT include markdown backticks. Return ONLY the raw JSON object."
        )

        headers = {
            "Authorization": f"Bearer {settings.OPENROUTER_KEY}",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "NeuroNudge AI Speech Fluency System",
            "Content-Type": "application/json"
        }

        body = {
            "model": "openai/gpt-4o-mini",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Evaluate this spoken expression: '{payload.text}'"}
            ],
            "max_tokens": 250,
            "temperature": 0.3
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=body)
            if res.status_code == 200:
                content = res.json()["choices"][0]["message"]["content"].strip()
                if content.startswith("```json"):
                    content = content[7:]
                if content.startswith("```"):
                    content = content[3:]
                if content.endswith("```"):
                    content = content[:-3]
                parsed = json.loads(content.strip())
                return {
                    "original": payload.text,
                    "corrected": parsed.get("corrected", payload.text),
                    "score": parsed.get("score", 85),
                    "notes": parsed.get("notes", "Great attempt expressing the scene!")
                }
            else:
                raise Exception(f"OpenRouter HTTP {res.status_code}: {res.text}")

    except Exception as e:
        print(f"[SecondStep Error] {e}")
        words = payload.text.capitalize()
        return {
            "original": payload.text,
            "corrected": words if words.endswith(".") else words + ".",
            "score": 80,
            "notes": "Spoken description captured clearly."
        }
