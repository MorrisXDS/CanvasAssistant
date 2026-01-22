/**
 * Icon Component
 * Centralized icon exports from lucide-react
 */

import {
  LayoutDashboard,
  Calendar,
  BookOpen,
  FolderOpen,
  GraduationCap,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  FileText,
  Bell,
  BellOff,
  RefreshCw,
  Settings,
  ChevronRight,
  ChevronDown,
  BarChart3,
  Target,
  Zap,
  PartyPopper,
  Inbox,
  Shield,
  Wifi,
  WifiOff,
  Database,
  Activity,
  type LucideIcon,
} from 'lucide-react';

// Re-export commonly used icons
export {
  LayoutDashboard,
  Calendar,
  BookOpen,
  FolderOpen,
  GraduationCap,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  FileText,
  Bell,
  BellOff,
  RefreshCw,
  Settings,
  ChevronRight,
  ChevronDown,
  BarChart3,
  Target,
  Zap,
  PartyPopper,
  Inbox,
  Shield,
  Wifi,
  WifiOff,
  Database,
  Activity,
};

export type { LucideIcon };

// Icon mapping for nav items
export const NavIcons: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  calendar: Calendar,
  courses: BookOpen,
  files: FolderOpen,
};

// Icon mapping for priority/status
export const StatusIcons: Record<string, LucideIcon> = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
  info: AlertCircle,
};
