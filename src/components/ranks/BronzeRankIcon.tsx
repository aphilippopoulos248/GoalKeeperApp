import { StyleProp, ViewStyle } from 'react-native';
import Svg, {
  Defs,
  G,
  LinearGradient,
  Path,
  Polygon,
  Stop,
} from 'react-native-svg';

type BronzeRankIconProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function BronzeRankIcon({ size = 200, style }: BronzeRankIconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      style={style}
      accessibilityRole="image"
      accessibilityLabel="Bronze rank badge"
    >
      <Defs>
        <LinearGradient id="bronzeFace" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#e4a85c" />
          <Stop offset="35%" stopColor="#c17f3a" />
          <Stop offset="55%" stopColor="#a86b2d" />
          <Stop offset="78%" stopColor="#7a4a1f" />
          <Stop offset="100%" stopColor="#4a2f14" />
        </LinearGradient>
        <LinearGradient id="bronzeRim" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#f0c47a" />
          <Stop offset="45%" stopColor="#8f5e28" />
          <Stop offset="100%" stopColor="#3d2610" />
        </LinearGradient>
        <LinearGradient id="bronzeStar" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#ffe8b8" />
          <Stop offset="50%" stopColor="#d4a04a" />
          <Stop offset="100%" stopColor="#7a4a1a" />
        </LinearGradient>
        <LinearGradient id="ribbon" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#5a3218" />
          <Stop offset="50%" stopColor="#8b5224" />
          <Stop offset="100%" stopColor="#4a2812" />
        </LinearGradient>
      </Defs>

      <Path
        d="M 28 98 L 38 108 L 60 102 L 82 108 L 92 98 L 88 94 L 72 96 L 60 92 L 48 96 L 32 94 Z"
        fill="url(#ribbon)"
        opacity={0.92}
      />

      <Path
        d="M 60 26 C 72 26 84 30 92 38 L 92 72 C 92 92 78 106 60 112 C 42 106 28 92 28 72 L 28 38 C 36 30 48 26 60 26 Z"
        fill="url(#bronzeFace)"
        stroke="url(#bronzeRim)"
        strokeWidth={2.2}
        strokeLinejoin="round"
      />

      <Path
        d="M 60 32 C 70 32 80 35 86 42 L 86 70 C 86 88 74 100 60 105 C 46 100 34 88 34 70 L 34 42 C 40 35 50 32 60 32 Z"
        fill="none"
        stroke="#f5d4a080"
        strokeWidth={1.2}
      />

      <G opacity={0.55}>
        <Path
          d="M 38 52 Q 32 62 36 74"
          stroke="#3d6b3a"
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M 82 52 Q 88 62 84 74"
          stroke="#3d6b3a"
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
      </G>

      <Path
        d="M 60 56 m -14 0 a 14 14 0 1 1 28 0 a 14 14 0 1 1 -28 0"
        fill="#6b4423"
        stroke="#3d2610"
        strokeWidth={1}
      />
      <Path
        d="M 60 56 m -10 0 a 10 10 0 1 1 20 0 a 10 10 0 1 1 -20 0"
        fill="none"
        stroke="#c9934a"
        strokeWidth={0.9}
        opacity={0.85}
      />

      <G transform="translate(60, 18)">
        <Polygon
          points="0,-11 3,-3 11,-3 4,2 7,11 0,5 -7,11 -4,2 -11,-3 -3,-3"
          fill="url(#bronzeStar)"
          stroke="#5c3818"
          strokeWidth={0.6}
          strokeLinejoin="round"
        />
      </G>
    </Svg>
  );
}