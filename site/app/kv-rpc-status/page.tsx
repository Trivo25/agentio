import KvStatus from './KvStatus';

export const metadata = {
  title: '0xAgentio · 0G KV Storage Node',
  description:
    'Public RPC endpoint for the 0G KV Storage Node hosted by 0xAgentio.',
};

export default function KvRpcStatusPage() {
  return <KvStatus />;
}
