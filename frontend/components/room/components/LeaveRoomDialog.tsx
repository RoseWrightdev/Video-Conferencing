'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import * as Typo from '@/components/ui/typography';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useRoomStore } from '@/store/useRoomStore';
import { useShallow } from 'zustand/react/shallow';
import { useState } from 'react';

export default function LeaveRoomDialog() {
    const router = useRouter();
    const [newOwnerId, setNewOwnerId] = useState<string>('');

    const {
        isLeaveDialogOpen,
        setLeaveDialogOpen,
        isHost,
        leaveRoom,
        participants,
        currentUserId,
        transferOwnership,
    } = useRoomStore(useShallow((state) => ({
        isLeaveDialogOpen: state.isLeaveDialogOpen,
        setLeaveDialogOpen: state.setLeaveDialogOpen,
        isHost: state.isHost,
        leaveRoom: state.leaveRoom,
        participants: state.participants,
        currentUserId: state.currentUserId,
        transferOwnership: state.transferOwnership,
    })));

    const otherParticipants = Array.from(participants.values()).filter(
        (p) => p.id !== currentUserId
    );

    const handleLeave = () => {
        if (isHost && newOwnerId) {
            transferOwnership(newOwnerId);
        }
        setLeaveDialogOpen(false);
        router.push('/');
        leaveRoom();
        setNewOwnerId(''); // Reset state
    };

    return (
        <Dialog open={isLeaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
            <DialogContent className="sm:max-w-md bg-white/90 frosted-2 border-white/20 fixed!">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold">Leave Room?</DialogTitle>
                    <Typo.P className="text-gray-600 mt-2">
                        {isHost
                            ? otherParticipants.length > 0
                                ? "You can transfer ownership to another participant before leaving, or end the meeting for everyone."
                                : "Do you want to leave the room, or end the meeting for everyone?"
                            : "Are you sure you want to leave the room?"}
                    </Typo.P>
                </DialogHeader>
                <div className="flex flex-col gap-3 mt-4">
                    {isHost && otherParticipants.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <Label>Transfer Ownership (Optional)</Label>
                            <Select value={newOwnerId} onValueChange={setNewOwnerId}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select new owner" />
                                </SelectTrigger>
                                <SelectContent>
                                    {otherParticipants.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.username || `User ${p.id.slice(0, 4)}`}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {isHost && otherParticipants.length > 0 && (
                        <Button
                            variant="destructive"
                            onClick={handleLeave}
                            disabled={!!newOwnerId} // Disable "End Meeting" if transferring
                        >
                            End Meeting for All
                        </Button>
                    )}
                    <Button
                        variant={newOwnerId ? "default" : "outline"}
                        className={!newOwnerId ? "hover:bg-gray-100 transition-colors" : ""}
                        onClick={handleLeave}
                    >
                        {isHost
                            ? newOwnerId
                                ? "Transfer & Leave"
                                : "Leave (Ends meeting)"
                            : "Leave Room"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
