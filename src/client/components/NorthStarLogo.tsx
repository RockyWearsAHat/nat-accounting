import React from 'react';

interface NorthStarLogoProps {
  size?: number;
  color?: string;
  className?: string;
  animate?: boolean;
}

export const NorthStarLogo: React.FC<NorthStarLogoProps> = ({ 
  size = 100, 
  color = '#ffffff',
  className = '',
  animate = false
}) => {
  // Parse color to extract RGB and alpha if it's rgba
  const parseColor = (colorStr: string) => {
    if (colorStr.startsWith('rgba')) {
      const match = colorStr.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
      if (match) {
        return {
          rgb: `rgb(${match[1]}, ${match[2]}, ${match[3]})`,
          alpha: parseFloat(match[4])
        };
      }
    }
    return { rgb: colorStr, alpha: 1 };
  };

  const { rgb, alpha } = parseColor(color);

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 200 200" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={animate ? { animation: 'rotate-slow 60s linear infinite' } : undefined}
    >
      {/* 4-pointed star with deeply inward-curving bezier connections */}
      <g opacity={alpha} fill={rgb} fillRule="evenodd">
        <path d={
          // North point (100, 10) → East point (190, 100) with deep inward curve
          // Control points closer to center (100, 100) create the concave star shape
          `M 100 10
           C 115 50, 150 85, 190 100
           C 150 115, 115 150, 100 190
           C 85 150, 50 115, 10 100
           C 50 85, 85 50, 100 10
           Z`
        } />
      </g>
    </svg>
  );
};
