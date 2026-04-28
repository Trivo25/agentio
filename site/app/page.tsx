import Hero from '@/components/Hero';
import WhatItDoes from '@/components/sections/WhatItDoes';
import HowItWorks from '@/components/sections/HowItWorks';
import PrivateTrust from '@/components/sections/PrivateTrust';
import AgentCollaboration from '@/components/sections/AgentCollaboration';

export default function Home() {
  return (
    <main>
      <Hero />
      <WhatItDoes />
      <HowItWorks />
      <PrivateTrust />
      <AgentCollaboration />
    </main>
  );
}
