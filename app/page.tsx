'use client'

import { useAuth } from '@/components/providers/auth-provider'
import { Button } from '@/components/ui/button'
import { ArrowRight, Building2, FileUp, BarChart3 } from 'lucide-react'
import Image from 'next/image'

export default function LandingPage() {
  const { user } = useAuth()

  return (
    <div className="flex flex-col items-center">
      {/* Hero Section */}
      <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48 bg-background">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center space-y-4 text-center">
            <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none">
              Professional 3D Noise Analysis Platform
            </h1>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">
              Empower your noise engineering and architectural projects with sophisticated visualization and analysis tools.
            </p>
            {!user && (
              <div className="space-x-4">
                <Button className="inline-flex h-9 items-center justify-center px-6">
                  Start Free Trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="w-full py-12 md:py-24 lg:py-32 bg-muted/50">
        <div className="container px-4 md:px-6">
          <h2 className="text-3xl font-bold tracking-tighter text-center mb-12">
            Powerful Features for Professionals
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center space-y-4 p-6 bg-background rounded-lg shadow-lg">
              <div className="p-3 bg-primary/10 rounded-full">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold">3D Visualization</h3>
              <p className="text-center text-muted-foreground">
                Advanced visualization modes for elevation data, buildings, and infrastructure elements.
              </p>
            </div>
            <div className="flex flex-col items-center space-y-4 p-6 bg-background rounded-lg shadow-lg">
              <div className="p-3 bg-primary/10 rounded-full">
                <FileUp className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold">Data Import</h3>
              <p className="text-center text-muted-foreground">
                Support for multiple file formats including Point Cloud, CAD, and GIS data.
              </p>
            </div>
            <div className="flex flex-col items-center space-y-4 p-6 bg-background rounded-lg shadow-lg">
              <div className="p-3 bg-primary/10 rounded-full">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold">Analysis Tools</h3>
              <p className="text-center text-muted-foreground">
                Comprehensive noise analysis capabilities with real-time processing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Swiss Market Focus */}
      <section className="w-full py-12 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="space-y-4">
              <h2 className="text-3xl font-bold tracking-tighter">
                Built for Swiss Professionals
              </h2>
              <p className="text-muted-foreground">
                Tailored specifically for noise engineers and architects in Switzerland, 
                our platform provides the tools you need for precise analysis and visualization.
              </p>
              <ul className="space-y-2">
                <li className="flex items-center">
                  <ArrowRight className="mr-2 h-4 w-4 text-primary" />
                  <span>Swiss standards compliance</span>
                </li>
                <li className="flex items-center">
                  <ArrowRight className="mr-2 h-4 w-4 text-primary" />
                  <span>Local format support</span>
                </li>
                <li className="flex items-center">
                  <ArrowRight className="mr-2 h-4 w-4 text-primary" />
                  <span>Integration with Swiss software tools</span>
                </li>
              </ul>
            </div>
            <div className="relative h-[400px] bg-muted rounded-lg">
              {/* Placeholder for a relevant image */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-muted rounded-lg" />
            </div>
          </div>
        </div>
      </section>

      {/* Pricing CTA */}
      <section className="w-full py-12 md:py-24 lg:py-32 bg-muted/50">
        <div className="container px-4 md:px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tighter mb-4">
            Start Using SonoMap Studio Today
          </h2>
          <p className="mx-auto max-w-[600px] text-muted-foreground mb-8">
            Choose between our flexible monthly subscription or lifetime access options.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="p-6 bg-background rounded-lg shadow-lg">
              <h3 className="text-xl font-bold mb-2">Monthly Subscription</h3>
              <p className="text-3xl font-bold mb-4">CHF 30<span className="text-sm font-normal">/month</span></p>
              <Button className="w-full">Subscribe Now</Button>
            </div>
            <div className="p-6 bg-background rounded-lg shadow-lg">
              <h3 className="text-xl font-bold mb-2">Lifetime Access</h3>
              <p className="text-3xl font-bold mb-4">CHF 1000</p>
              <Button className="w-full">Get Lifetime Access</Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}