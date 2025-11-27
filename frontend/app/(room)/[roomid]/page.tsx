'use client';

import React, { useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';


export default function RoomPage() {
  const params = useParams();
  const roomId = params?.roomid as string;

}
