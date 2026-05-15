import React from 'react';
import { StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import DashboardScreen from '../screens/DashboardScreen';
import MarketScreen from '../screens/MarketScreen';
import AIAnalysisScreen from '../screens/AIAnalysisScreen';
import PortfolioScreen from '../screens/PortfolioScreen';
import SettingsScreen from '../screens/SettingsScreen';
import StrategyScreen from '../screens/StrategyScreen';

import { colors, typography } from '../theme';

const Tab = createBottomTabNavigator();

type IconName = string;

function getTabIcon(routeName: string, focused: boolean): IconName {
  switch (routeName) {
    case 'Dashboard':
      return focused ? 'view-dashboard' : 'view-dashboard-outline';
    case 'Market':
      return focused ? 'chart-line' : 'chart-line-variant';
    case 'AIAnalysis':
      return focused ? 'robot' : 'robot-outline';
    case 'Strategy':
      return 'lightning-bolt';
    case 'Portfolio':
      return focused ? 'briefcase' : 'briefcase-outline';
    case 'Settings':
      return focused ? 'cog' : 'cog-outline';
    default:
      return 'circle';
  }
}

function getTabLabel(routeName: string): string {
  switch (routeName) {
    case 'AIAnalysis':
      return 'AI';
    default:
      return routeName;
  }
}

const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
            borderBottomWidth: 1,
            elevation: 0,
            shadowOpacity: 0,
          },
          headerTitleStyle: {
            color: colors.text,
            fontSize: typography.lg,
            fontWeight: '700',
            letterSpacing: 0.5,
          },
          headerTintColor: colors.text,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            paddingBottom: 4,
            paddingTop: 4,
            height: 60,
            elevation: 8,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.3,
            shadowRadius: 4,
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            letterSpacing: 0.3,
          },
          tabBarIcon: ({ focused, color, size }) => (
            <Icon
              name={getTabIcon(route.name, focused)}
              size={size}
              color={color}
            />
          ),
          tabBarLabel: getTabLabel(route.name),
        })}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ title: 'TradingAI' }}
        />
        <Tab.Screen
          name="Market"
          component={MarketScreen}
          options={{ title: 'Market Analysis' }}
        />
        <Tab.Screen
          name="AIAnalysis"
          component={AIAnalysisScreen}
          options={{ title: 'AI Analysis' }}
        />
        <Tab.Screen
          name="Strategy"
          component={StrategyScreen}
          options={{ title: 'Strategies' }}
        />
        <Tab.Screen
          name="Portfolio"
          component={PortfolioScreen}
          options={{ title: 'Portfolio' }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Settings' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
