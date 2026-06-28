"use client"

import Link from "next/link"
import Image from "next/image"
import { Mail, Phone, MapPin } from "lucide-react"
import { useTranslation } from "@/lib/i18n/useTranslation"
import { useAppSettings } from "@/hooks/useAppSettings"
import { useFeatureFlagContext } from "@/contexts/FeatureFlagContext"
import { motion } from "motion/react"
import { FadeInSection, StaggerContainer, StaggerItem } from "./animations/AnimatedSection"

// SVG social media icons (inline for zero bundle overhead)
const FacebookIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
  </svg>
)

const InstagramIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" />
  </svg>
)

const TwitterIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
)

const LinkedInIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
)

const TikTokIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
  </svg>
)

export function Footer() {
  const { t } = useTranslation()
  const { appName, supportEmail, supportPhone, socialFacebook, socialInstagram, socialTwitter, socialLinkedin, socialTiktok } = useAppSettings()
  const { isWebappAuthEnabled, isWaitlistEnabled } = useFeatureFlagContext()

  // Build social links array dynamically — only show links that are set in admin panel
  const socialLinks = [
    { url: socialFacebook, label: 'Facebook', icon: FacebookIcon },
    { url: socialInstagram, label: 'Instagram', icon: InstagramIcon },
    { url: socialTwitter, label: 'X', icon: TwitterIcon },
    { url: socialLinkedin, label: 'LinkedIn', icon: LinkedInIcon },
    { url: socialTiktok, label: 'TikTok', icon: TikTokIcon },
  ].filter(link => link.url && link.url.trim().length > 0)
  
  return (
    <footer className="bg-gray-900/80 backdrop-blur-sm text-gray-300 py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Static gradient orbs — no animation for better scroll performance */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-blue-900/20 rounded-full blur-3xl -z-10 opacity-25" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-900/20 rounded-full blur-3xl -z-10 opacity-25" />
      
      <div className="max-w-7xl mx-auto relative">
        <StaggerContainer className="grid md:grid-cols-4 gap-8 mb-8">
          <StaggerItem className="space-y-4">
            <motion.div 
              className="flex items-center space-x-2"
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.2 }}
            >
              <motion.div 
                className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0"
                whileHover={{ rotate: 5 }}
                transition={{ duration: 0.2 }}
              >
                <Image src="/icon.png" alt={appName} width={32} height={32} className="w-full h-full object-cover" />
              </motion.div>
              <span className="text-xl font-bold text-white">{appName}</span>
            </motion.div>
            <p className="text-sm text-gray-400">
              {t('landing.footer.description')}
            </p>
          </StaggerItem>

          <StaggerItem>
            <h3 className="text-white font-semibold mb-4">{t('landing.footer.product')}</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <motion.div whileHover={{ x: 5 }} transition={{ duration: 0.2 }}>
                  <Link href="/features" className="hover:text-white transition-colors">
                    {t('landing.footer.features')}
                  </Link>
                </motion.div>
              </li>
              {!isWaitlistEnabled && (
                <li>
                  <motion.div whileHover={{ x: 5 }} transition={{ duration: 0.2 }}>
                    <Link href="#download" className="hover:text-white transition-colors">
                      {t('landing.footer.downloadApp')}
                    </Link>
                  </motion.div>
                </li>
              )}
              {isWebappAuthEnabled && (
                <>
                  <li>
                    <motion.div whileHover={{ x: 5 }} transition={{ duration: 0.2 }}>
                      <Link href="/login" className="hover:text-white transition-colors">
                        {t('landing.auth.login')}
                      </Link>
                    </motion.div>
                  </li>
                  <li>
                    <motion.div whileHover={{ x: 5 }} transition={{ duration: 0.2 }}>
                      <Link href="/register" className="hover:text-white transition-colors">
                        {t('landing.auth.signUp')}
                      </Link>
                    </motion.div>
                  </li>
                </>
              )}
            </ul>
          </StaggerItem>

          <StaggerItem>
            <h3 className="text-white font-semibold mb-4">{t('landing.footer.support')}</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <motion.div whileHover={{ x: 5 }} transition={{ duration: 0.2 }}>
                  <Link href="/help" className="hover:text-white transition-colors">
                    {t('landing.footer.helpCenter')}
                  </Link>
                </motion.div>
              </li>
              <li>
                <motion.div whileHover={{ x: 5 }} transition={{ duration: 0.2 }}>
                  <Link href="/terms" className="hover:text-white transition-colors">
                    {t('landing.footer.termsOfService')}
                  </Link>
                </motion.div>
              </li>
              <li>
                <motion.div whileHover={{ x: 5 }} transition={{ duration: 0.2 }}>
                  <Link href="/privacy" className="hover:text-white transition-colors">
                    {t('landing.footer.privacyPolicy')}
                  </Link>
                </motion.div>
              </li>
            </ul>
          </StaggerItem>

          <StaggerItem>
            <h3 className="text-white font-semibold mb-4">{t('landing.footer.contact')}</h3>
            <ul className="space-y-3 text-sm">
              <li>
                <motion.a 
                  href={`mailto:${supportEmail}`} 
                  className="flex items-center space-x-2 hover:text-white transition-colors"
                  whileHover={{ x: 5 }}
                  transition={{ duration: 0.2 }}
                >
                  <Mail className="w-4 h-4" />
                  <span>{supportEmail}</span>
                </motion.a>
              </li>
              <li>
                <motion.a 
                  href={`tel:${supportPhone.replace(/\s/g, '')}`} 
                  className="flex items-center space-x-2 hover:text-white transition-colors"
                  whileHover={{ x: 5 }}
                  transition={{ duration: 0.2 }}
                >
                  <Phone className="w-4 h-4" />
                  <span>{supportPhone}</span>
                </motion.a>
              </li>
              <li className="flex items-center space-x-2">
                <MapPin className="w-4 h-4" />
                <span>Baku, Azerbaijan</span>
              </li>
            </ul>
          </StaggerItem>
        </StaggerContainer>

        <FadeInSection delay={0.3}>
          <div className="border-t border-gray-800 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
              <p className="text-sm text-gray-400">
                © {new Date().getFullYear()} {appName}. {t('landing.footer.allRightsReserved')}
              </p>
              {socialLinks.length > 0 && (
                <div className="flex items-center space-x-4">
                  {socialLinks.map(({ url, label, icon: Icon }) => (
                    <motion.a
                      key={label}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className="text-gray-400 hover:text-white transition-colors"
                      whileHover={{ y: -3, scale: 1.15 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Icon className="w-5 h-5" />
                    </motion.a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </FadeInSection>
      </div>
    </footer>
  )
}
