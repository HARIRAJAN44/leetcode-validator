import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DownloadScreen } from './src/screens/DownloadScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ProcessingScreen } from './src/screens/ProcessingScreen';
import { ResultsPreviewScreen } from './src/screens/ResultsPreviewScreen';
import { UploadScreen } from './src/screens/UploadScreen';
import { Colors } from './src/theme/colors';
import { RootStackParamList } from './src/types/api';

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: Colors.background,
    primary: Colors.primary,
    card: Colors.primary,
    text: Colors.textPrimary,
    border: Colors.border,
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer theme={AppTheme}>
        <StatusBar style="light" />
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerStyle: { backgroundColor: Colors.primary },
            headerTintColor: '#FFFFFF',
            headerTitleStyle: { fontWeight: '800', fontSize: 17 },
            contentStyle: { backgroundColor: Colors.background },
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: 'LeetCode Contest Tracker' }}
          />
          <Stack.Screen
            name="Upload"
            component={UploadScreen}
            options={{ title: 'Upload Excel Roster' }}
          />
          <Stack.Screen
            name="Processing"
            component={ProcessingScreen}
            options={{ title: 'Processing Contests' }}
          />
          <Stack.Screen
            name="ResultsPreview"
            component={ResultsPreviewScreen}
            options={{ title: 'Contest Results Preview' }}
          />
          <Stack.Screen
            name="Download"
            component={DownloadScreen}
            options={{ title: 'Download Excel' }}
          />
          <Stack.Screen
            name="History"
            component={HistoryScreen}
            options={{ title: 'Previous Jobs' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
