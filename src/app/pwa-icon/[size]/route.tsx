import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'

const SIZES = [180, 192, 512]

/** App icon: a dial on the dark purple. `?maskable=1` keeps the art inside the safe zone. */
export function GET(request: Request, { params }: { params: { size: string } }) {
    const size = Number(params.size)
    if (!SIZES.includes(size)) return new Response('Not found', { status: 404 })
    const maskable = new URL(request.url).searchParams.has('maskable')
    const art = size * (maskable ? 0.5 : 0.66)
    return new ImageResponse(
        (
            <div
                style={{
                    width: size,
                    height: size,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#271A3A',
                }}
            >
                <div
                    style={{
                        width: art,
                        height: art,
                        borderRadius: '50%',
                        background: '#46315F',
                        border: `${art * 0.06}px solid #8CCBFF`,
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                    }}
                >
                    <div
                        style={{
                            width: art * 0.1,
                            height: art * 0.42,
                            marginBottom: art * 0.43,
                            borderRadius: art,
                            background: '#FFD66B',
                            transform: 'rotate(35deg)',
                            transformOrigin: '50% 100%',
                        }}
                    />
                </div>
            </div>
        ),
        { width: size, height: size },
    )
}
