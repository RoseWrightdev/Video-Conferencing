import pytest
from unittest.mock import MagicMock, patch
import json
import cc_pb2

# Mock Llama before importing main
with patch("main.Llama") as MockLlama:
    from main import SummaryService, mock_llm_summarize, redis_client

@pytest.mark.asyncio
async def test_summarize_no_transcript():
    service = SummaryService()
    context = MagicMock()
    request = MagicMock()
    request.room_id = "test-room-empty"

    # Mock Redis to return empty
    with patch("main.redis_client") as mock_redis:
        mock_redis.lrange.return_value = []
        
        response = await service.Summarize(request, context)
        
        assert response.summary == "No transcript found."
        assert len(response.action_items) == 0

@pytest.mark.asyncio
async def test_summarize_with_transcript():
    service = SummaryService()
    context = MagicMock()
    request = MagicMock()
    request.room_id = "test-room-data"
    
    # Mock Redis
    dataset = [
        json.dumps({"user_id": "Alice", "text": "Hello team, let's discuss the roadmap."}),
        json.dumps({"user_id": "Bob", "text": "Sure, I think we should focus on Q1 items."}),
        json.dumps({"user_id": "Alice", "text": "Agreed. Bob, can you check the Jira tickets? Action Items: Check Jira."})
    ]

    with patch("main.redis_client") as mock_redis:
        mock_redis.lrange.return_value = dataset
        
        # Mock LLM (main.llm is global)
        with patch("main.llm") as mock_llm_instance:
            mock_llm_instance.create_chat_completion.return_value = {
                'choices': [{
                    'message': {
                        'content': "Summary: Team discussed roadmap. Action Items: \n- Check Jira"
                    }
                }]
            }
            
            response = await service.Summarize(request, context)
            
            assert "roadmap" in response.summary
            assert len(response.action_items) > 0
            assert "Check Jira" in response.action_items[0]
