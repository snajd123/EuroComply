import Link from 'next/link';

export default function Home() {
  return (
    <main className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">EuroComply Admin</h1>
      <nav className="space-y-4">
        <Link
          href="/admin/ingestor"
          className="block p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
        >
          <h2 className="text-xl font-semibold">AI Regulation Ingestor</h2>
          <p className="text-gray-600">Review and approve AI-extracted regulations</p>
        </Link>
      </nav>
    </main>
  );
}
