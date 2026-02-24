import React, { useEffect, useRef, useCallback } from 'react';

interface AudioVisualizerProps {
    analyser: AnalyserNode | null;
    mode: 'circle' | 'wave' | 'bars';
    color?: string;
    isActive: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
    analyser,
    mode = 'circle',
    color = '#00573D',
    isActive
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>();

    const draw = useCallback(() => {
        if (!canvasRef.current || !analyser) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
        }

        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const animate = () => {
            requestRef.current = requestAnimationFrame(animate);

            analyser.getByteFrequencyData(dataArray);

            const width = rect.width;
            const height = rect.height;
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = Math.min(width, height) / 3.5;

            ctx.clearRect(0, 0, width, height);

            if (mode === 'circle') {
                const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.8, centerX, centerY, radius * 1.5);
                gradient.addColorStop(0, `${color}10`);
                gradient.addColorStop(1, 'transparent');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, width, height);

                ctx.beginPath();
                for (let i = 0; i < bufferLength; i++) {
                    const barHeight = (dataArray[i] / 255) * (height / 3);
                    const angle = (i * 2 * Math.PI) / bufferLength;

                    const x = centerX + (radius + barHeight) * Math.cos(angle);
                    const y = centerY + (radius + barHeight) * Math.sin(angle);

                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.closePath();

                const strokeGradient = ctx.createLinearGradient(0, 0, width, height);
                strokeGradient.addColorStop(0, color);
                strokeGradient.addColorStop(0.5, `${color}80`);
                strokeGradient.addColorStop(1, color);

                ctx.strokeStyle = strokeGradient;
                ctx.lineWidth = 2.5;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(centerX, centerY, radius * 0.95, 0, 2 * Math.PI);
                ctx.fillStyle = `${color}08`;
                ctx.fill();

            } else if (mode === 'bars') {
                const barCount = Math.min(bufferLength, 64);
                const barWidth = (width / barCount) * 0.7;
                const gap = (width / barCount) * 0.3;
                let x = gap / 2;

                for (let i = 0; i < barCount; i++) {
                    const dataIndex = Math.floor((i / barCount) * bufferLength);
                    const normalizedValue = dataArray[dataIndex] / 255;
                    const barHeight = normalizedValue * height * 0.8;

                    const barGradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
                    barGradient.addColorStop(0, `${color}40`);
                    barGradient.addColorStop(1, color);

                    ctx.fillStyle = barGradient;

                    const r = barWidth / 2;
                    ctx.beginPath();
                    ctx.roundRect(x, height - barHeight, barWidth, barHeight, [r, r, 0, 0]);
                    ctx.fill();

                    x += barWidth + gap;
                }

            } else if (mode === 'wave') {
                const bgGradient = ctx.createLinearGradient(0, 0, width, 0);
                bgGradient.addColorStop(0, 'transparent');
                bgGradient.addColorStop(0.5, `${color}05`);
                bgGradient.addColorStop(1, 'transparent');
                ctx.fillStyle = bgGradient;
                ctx.fillRect(0, 0, width, height);

                ctx.lineWidth = 2.5;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                const waveGradient = ctx.createLinearGradient(0, 0, width, 0);
                waveGradient.addColorStop(0, `${color}20`);
                waveGradient.addColorStop(0.3, color);
                waveGradient.addColorStop(0.7, color);
                waveGradient.addColorStop(1, `${color}20`);
                ctx.strokeStyle = waveGradient;

                ctx.beginPath();

                const sliceWidth = width / bufferLength;
                let xPos = 0;

                for (let i = 0; i < bufferLength; i++) {
                    const v = dataArray[i] / 128.0;
                    const y = (v * height) / 2;

                    if (i === 0) {
                        ctx.moveTo(xPos, y);
                    } else {
                        const prevX = xPos - sliceWidth;
                        const cpX = prevX + sliceWidth / 2;
                        ctx.quadraticCurveTo(cpX, y, xPos, y);
                    }

                    xPos += sliceWidth;
                }

                ctx.lineTo(width, height / 2);
                ctx.stroke();

                ctx.lineTo(width, height);
                ctx.lineTo(0, height);
                ctx.closePath();
                ctx.fillStyle = `${color}08`;
                ctx.fill();
            }
        };

        animate();
    }, [analyser, mode, color]);

    useEffect(() => {
        if (!isActive) {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
            if (canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                }
            }
            return;
        }

        draw();

        return () => {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        };
    }, [analyser, mode, color, isActive, draw]);

    useEffect(() => {
        const handleResize = () => {
            if (isActive && analyser) {
                draw();
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [isActive, analyser, draw]);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            aria-hidden="true"
            role="presentation"
        />
    );
};
