import { notFound } from 'next/navigation';
import DatabaseCheck from './database-check';

export default function DatabasePage() {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) notFound();
  return <DatabaseCheck />;
}
