'use client';

import { useState, useEffect } from 'react';
import { mfaService, MFAEnrollmentData, MFAFactor } from '@/services/mfaService';
import { Shield, ShieldCheck, ShieldOff, Loader2, Copy, Check, AlertTriangle } from 'lucide-react';
import Image from 'next/image';

interface TwoFactorSetupProps {
  onStatusChange?: (enabled: boolean) => void;
}

type SetupStep = 'initial' | 'enrolling' | 'verify' | 'complete';

export function TwoFactorSetup({ onStatusChange }: TwoFactorSetupProps) {
  const [loading, setLoading] = useState(true);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [factors, setFactors] = useState<MFAFactor[]>([]);
  const [setupStep, setSetupStep] = useState<SetupStep>('initial');
  const [enrollmentData, setEnrollmentData] = useState<MFAEnrollmentData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);

  useEffect(() => {
    loadMFAStatus();
  }, []);

  const loadMFAStatus = async () => {
    setLoading(true);
    try {
      const factorsData = await mfaService.getFactors();
      const verifiedFactors = factorsData.totp.filter(f => f.status === 'verified');
      setFactors(verifiedFactors);
      setMfaEnabled(verifiedFactors.length > 0);
    } catch (err) {
      console.error('Failed to load MFA status:', err);
    } finally {
      setLoading(false);
    }
  };

  const startEnrollment = async () => {
    setError(null);
    setSetupStep('enrolling');
    
    try {
      const data = await mfaService.enrollTOTP('Elmly Admin');
      setEnrollmentData(data);
      setSetupStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start 2FA setup');
      setSetupStep('initial');
    }
  };

  const verifyAndComplete = async () => {
    if (!enrollmentData || verificationCode.length !== 6) return;

    setIsVerifying(true);
    setError(null);

    try {
      const result = await mfaService.verifyEnrollment(enrollmentData.factorId, verificationCode);
      
      if (result.success) {
        setSetupStep('complete');
        setMfaEnabled(true);
        onStatusChange?.(true);
        await loadMFAStatus();
      } else {
        setError(result.error || 'Invalid verification code');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const disableMFA = async (factorId: string) => {
    if (!confirm('Are you sure you want to disable Two-Factor Authentication? This will make your account less secure.')) {
      return;
    }

    setIsDisabling(true);
    setError(null);

    try {
      const result = await mfaService.unenroll(factorId);
      
      if (result.success) {
        setMfaEnabled(false);
        setFactors([]);
        onStatusChange?.(false);
        setSetupStep('initial');
      } else {
        setError(result.error || 'Failed to disable 2FA');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setIsDisabling(false);
    }
  };

  const copySecret = () => {
    if (enrollmentData?.secret) {
      navigator.clipboard.writeText(enrollmentData.secret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    }
  };

  const resetSetup = () => {
    setSetupStep('initial');
    setEnrollmentData(null);
    setVerificationCode('');
    setError(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        {mfaEnabled ? (
          <ShieldCheck className="h-8 w-8 text-green-500" />
        ) : (
          <Shield className="h-8 w-8 text-gray-400" />
        )}
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Two-Factor Authentication</h3>
          <p className="text-sm text-gray-500">
            {mfaEnabled 
              ? 'Your account is protected with 2FA' 
              : 'Add an extra layer of security to your account'}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* MFA Enabled State */}
      {mfaEnabled && setupStep === 'initial' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg">
            <ShieldCheck className="h-5 w-5" />
            <span className="font-medium">Two-Factor Authentication is enabled</span>
          </div>

          {factors.map((factor) => (
            <div key={factor.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">{factor.friendly_name || 'Authenticator App'}</p>
                <p className="text-sm text-gray-500">
                  Added on {new Date(factor.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => disableMFA(factor.id)}
                disabled={isDisabling}
                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              >
                {isDisabling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Remove'
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Initial Setup State */}
      {!mfaEnabled && setupStep === 'initial' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <ShieldOff className="h-5 w-5 text-amber-500 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">2FA is not enabled</p>
                <p className="text-sm text-amber-700 mt-1">
                  We strongly recommend enabling Two-Factor Authentication to protect your admin account from unauthorized access.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={startEnrollment}
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <Shield className="h-5 w-5" />
            Enable Two-Factor Authentication
          </button>
        </div>
      )}

      {/* Enrollment in Progress */}
      {setupStep === 'enrolling' && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <span className="ml-3 text-gray-600">Setting up 2FA...</span>
        </div>
      )}

      {/* QR Code Verification Step */}
      {setupStep === 'verify' && enrollmentData && (
        <div className="space-y-6">
          <div className="text-center">
            <p className="text-gray-600 mb-4">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
            </p>
            
            <div className="inline-block p-4 bg-white border-2 border-gray-200 rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={enrollmentData.qrCode} 
                alt="2FA QR Code" 
                className="w-48 h-48"
              />
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-2">
              Can&apos;t scan? Enter this code manually:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-white px-3 py-2 rounded border border-gray-200 font-mono text-sm break-all">
                {enrollmentData.secret}
              </code>
              <button
                onClick={copySecret}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                title="Copy secret"
              >
                {secretCopied ? (
                  <Check className="h-5 w-5 text-green-500" />
                ) : (
                  <Copy className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Enter the 6-digit code from your authenticator app
            </label>
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={6}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={resetSetup}
              className="flex-1 py-3 px-4 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={verifyAndComplete}
              disabled={verificationCode.length !== 6 || isVerifying}
              className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify & Enable'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Setup Complete */}
      {setupStep === 'complete' && (
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full">
            <ShieldCheck className="h-8 w-8 text-green-600" />
          </div>
          <div>
            <h4 className="text-lg font-semibold text-gray-900">2FA Enabled Successfully!</h4>
            <p className="text-gray-600 mt-1">
              Your account is now protected with Two-Factor Authentication.
            </p>
          </div>
          <button
            onClick={() => setSetupStep('initial')}
            className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
