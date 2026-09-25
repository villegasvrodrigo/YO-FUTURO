import { ScreenLoading } from '@/app/_components/ScreenLoading';

// Shown at once while Chat loads (see ScreenLoading).
export default function ChatLoading() {
  return <ScreenLoading kind="chat" />;
}
