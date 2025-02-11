import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <Image src="/logo.png" alt="Logo" width={200} height={200} priority />
    </div>
  );
}
