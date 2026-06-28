import { NextResponse } from 'next/server';
import { emailService } from '@/lib/email/emailService';

export async function GET() {
  try {
    const configured = emailService?.isConfigured() || false;
    return NextResponse.json({ configured });
  } catch {
    return NextResponse.json({ configured: false });
  }
}
