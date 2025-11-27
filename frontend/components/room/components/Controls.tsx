import { 
  Mic, 
  MicOff, 
  Camera, 
  CameraOff, 
  ScreenShare, 
  ScreenShareOff,
  Phone,
  PhoneMissed,
  Share2,
  Users,
  Keyboard,
} from "lucide-react";
import { ControlDependencies } from "../types/ControlsDependcies";

export interface ControlBarProps {
  dependencies: ControlDependencies;
}

export default function ControlBar({ dependencies }: ControlBarProps) {
  const { mediaService, roomControlService } = dependencies;
  return (
    <>
      <div>
        {/* Share Toggle Circle Button */}

        {/* Participants Toggle Circle Button */}
      
      </div>
      <div className={"flex items-center justify-between p-4 bg-background border-t"}>
        {/* Audio Switch */}
        
        {/* Video Switch */}

        {/* Screen Share Toggle Button */}

        {/* Leave Room */}
      </div>
      <div>
        {/* Chat Toggle Circle Button */}
      </div>
    </>
  );
}

function CircleButton({children}: Readonly<{children: React.ReactNode;}>) {
  return (
    <div className="">
      {children}
    </div>
  )
}