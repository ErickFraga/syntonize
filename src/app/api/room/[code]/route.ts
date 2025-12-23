import { NextRequest, NextResponse } from 'next/server'

// This is a workaround - in production we'd use the socket server
// For now, we'll use the socket to get room info
export async function GET(
    request: NextRequest,
    { params }: { params: { code: string } }
) {
    const code = params.code.toUpperCase()

    // Return placeholder - the actual room info comes from socket
    // This API is for future REST integration
    return NextResponse.json({
        code,
        hostName: null, // Will be fetched via socket in the join page
        exists: true
    })
}
