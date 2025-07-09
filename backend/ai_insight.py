
from fastapi import APIRouter
from backend.analytics import generate_analytics
from backend.llm import summarize_analytics

router = APIRouter()

@router.get("/api/ai-insight")
async def ai_insight():
    analytics = await generate_analytics()
    summary = summarize_analytics(analytics)
    return {"summary": summary}
