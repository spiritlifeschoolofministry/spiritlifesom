import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.spiritlifesom.app',
  appName: 'Spirit Life SOM',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
