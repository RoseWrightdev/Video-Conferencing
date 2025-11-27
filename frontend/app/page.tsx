'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [roomId, setRoomId] = useState('');

  const generateRoomId = () => {
    const id = Math.random().toString(36).substring(2, 15);
    setRoomId(id);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!roomId.trim()) {
      return;
    }

    if (status !== 'authenticated') {
      signIn('auth0', { callbackUrl: `/${roomId.trim()}` });
      return;
    }

    router.push(`/${roomId.trim()}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Video Conference</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {status === 'authenticated' 
              ? `Welcome, ${session?.user?.name || session?.user?.email}`
              : 'Sign in to join or create a room'
            }
          </p>
        </div>

        <form onSubmit={handleJoinRoom} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="roomId" className="text-sm font-medium">Room ID</label>
            <div className="flex gap-2">
              <Input
                id="roomId"
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Enter or generate room ID"
                required
                className="flex-1"
              />
              <Button type="button" onClick={generateRoomId} variant="outline">
                Generate
              </Button>
            </div>
          </div>

          <Button type="submit" className="w-full" size="lg">
            {status === 'authenticated' ? 'Join Room' : 'Sign In & Join'}
          </Button>
        </form>

        {status === 'authenticated' && (
          <div className="text-center">
            <Button variant="link" onClick={() => signIn('auth0')}>
              Not you? Sign in with a different account
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
