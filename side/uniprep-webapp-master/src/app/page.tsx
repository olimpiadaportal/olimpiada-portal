import { Navbar } from "@/components/landing/Navbar"
import { Hero } from "@/components/landing/Hero"
import { Features } from "@/components/landing/Features"
import { AppShowcase } from "@/components/landing/AppShowcase"
import { Footer } from "@/components/landing/Footer"
import { LandingBackground } from "@/components/landing/LandingBackground"

export default function Home() {
  return (
    <LandingBackground>
      <div className="relative min-h-screen overflow-x-hidden">
        <Navbar />
        <Hero />
        <Features />
        <AppShowcase />
        <Footer />
      </div>
    </LandingBackground>
  )
}
