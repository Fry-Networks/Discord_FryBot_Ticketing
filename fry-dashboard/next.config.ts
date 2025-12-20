/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    allowedDevOrigins: ['https://fryticketsdash.aitechbit.xyz'],
    typedRoutes: false
  },
  images: {
    domains: ['cdn.discordapp.com']
  }
}

export default nextConfig