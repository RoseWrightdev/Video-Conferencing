import { useState } from 'react';

interface UsePermissionsProps {
    requestPermissions: () => Promise<boolean>;
    setHasJoinedLobby: (joined: boolean) => void;
    handleError: (error: string) => void;
}

export function usePermissions({ requestPermissions, setHasJoinedLobby, handleError }: UsePermissionsProps) {
    const [permissionsGranted, setPermissionsGranted] = useState(() => {
        // Check localStorage for previously granted permissions
        if (typeof window !== 'undefined') {
            return localStorage.getItem('media-permissions-granted') === 'true';
        }
        return false;
    });

    const handleRequestPermissions = async () => {
        // If permissions already granted (or just granted), this acts as the "Join" button
        if (permissionsGranted) {
            setHasJoinedLobby(true);
            return;
        }
        try {
            await requestPermissions();
            // Don't initialize stream yet - only when user enables audio/video
            setPermissionsGranted(true);
            // Store permissions grant in localStorage
            localStorage.setItem('media-permissions-granted', 'true');

            // Auto-join after granting permissions (counts as interaction)
            setHasJoinedLobby(true);
        } catch (error) {
            handleError(error instanceof Error ? error.message : 'Failed to get permissions');
        }
    };

    return {
        permissionsGranted,
        setPermissionsGranted,
        handleRequestPermissions
    };
}
