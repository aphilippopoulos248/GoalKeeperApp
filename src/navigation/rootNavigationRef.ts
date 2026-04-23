import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './RootStack';

export const rootNavigationRef = createNavigationContainerRef<RootStackParamList>();
