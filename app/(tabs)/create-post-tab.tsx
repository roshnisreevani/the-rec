import { View } from 'react-native';

// This route file exists only so the "+" tab below has a screen to point at.
// Its tabPress listener always calls e.preventDefault() and pushes the real
// /create-post modal instead, so this component never actually renders.
export default function CreatePostTabStub() {
  return <View />;
}
