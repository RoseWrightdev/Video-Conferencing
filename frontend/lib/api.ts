export interface SummaryResponse {
    room_id: string;
    summary: string;
    action_items: string[];
}

export async function summarizeMeeting(roomId: string): Promise<SummaryResponse> {
    const response = await fetch(`/api/rooms/${roomId}/summary`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to generate summary');
    }

    return response.json();
}
