import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <main className="flex-1 grid place-items-center bg-[#081a2b] px-6 py-12">
      <SignUp />
    </main>
  );
}
