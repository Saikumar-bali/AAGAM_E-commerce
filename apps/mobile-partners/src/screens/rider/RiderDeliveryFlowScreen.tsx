import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bell,
  Camera,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  HeartPulse,
  HelpCircle,
  IndianRupee,
  LockKeyhole,
  MapPin,
  Menu,
  Navigation,
  PackageCheck,
  Phone,
  ShieldCheck,
  Signature,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Toast from 'react-native-toast-message';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import {
  DeliveryFailureReason,
  DeliveryOperationsSummary,
  deliveryOperationsService,
} from '../../api/deliveryOperationsService';
import { riderService } from '../../api/riderService';
import { RiderRouteMap } from '../../components/rider/RiderRouteMap';
import {
  RIDER_FAILURE_CHOICES,
  RiderCompletionReceipt,
  RiderDeliveryFlowView,
  buildRiderCompletionReceipt,
  deliveryFlowViewForStatus,
  formatRiderAddress,
  formatRupees,
  shortRiderOrderId,
} from '../../domain/riderDeliveryFlow';
import type { RiderDeliveryJob, RiderWorkspace } from '../../domain/riderWorkspace';
import { RiderDeliveryOperationsScreen } from './RiderDeliveryOperationsScreen';

const WORKSPACE_KEY = ['rider', 'delivery-workspace'] as const;
const SUMMARY_KEY = ['rider', 'delivery-operations'] as const;
const EARNINGS_KEY = ['rider', 'earnings'] as const;

type ProofChoice = 'CUSTOMER_PHOTO' | 'DELIVERY_PHOTO' | 'SIGNATURE';

type HeaderProps = {
  title: string;
  onBack?: () => void;
  leftMenu?: boolean;
  right?: 'BELL' | 'SHIELD' | 'HELP';
  onRightPress?: () => void;
};

function errorMessage(error: any) {
  const message = error?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message || error?.message || 'The operation could not be completed.';
}

function captureLocation() {
  return new Promise<{ latitude: number; longitude: number; accuracyMetres?: number }>((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMetres: position.coords.accuracy,
      }),
      reject,
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    );
  });
}

function DeliveryHeader({ title, onBack, leftMenu, right = 'SHIELD', onRightPress }: HeaderProps) {
  const RightIcon = right === 'BELL' ? Bell : right === 'HELP' ? HelpCircle : ShieldCheck;
  const LeftIcon = leftMenu ? Menu : ArrowLeft;
  return (
    <View style={styles.header}>
      <TouchableOpacity
        accessibilityRole="button"
        testID="rider_delivery_header_back"
        style={styles.headerSide}
        onPress={onBack}
        disabled={!onBack}
      >
        <LeftIcon size={31} color="#FFFFFF" strokeWidth={2.3} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      <TouchableOpacity
        accessibilityRole="button"
        style={styles.headerSide}
        onPress={onRightPress}
        disabled={!onRightPress}
      >
        <RightIcon size={30} color="#FFFFFF" strokeWidth={2.1} />
        {right === 'BELL' ? <View style={styles.bellBadge}><Text style={styles.bellBadgeText}>1</Text></View> : null}
      </TouchableOpacity>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
  icon,
  testID,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      activeOpacity={0.86}
      disabled={busy || disabled}
      onPress={onPress}
      style={[styles.primaryButton, (busy || disabled) && styles.buttonDisabled]}
    >
      {busy ? <ActivityIndicator color="#FFFFFF" /> : icon}
      <Text style={styles.primaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function SectionCard({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function CustomerCard({ job, onCall, onMap }: { job: RiderDeliveryJob; onCall: () => void; onMap: () => void }) {
  const customerName = job.order.customer?.name || job.order.addressSnapshot?.recipientName || 'Customer';
  const initials = customerName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'CU';
  return (
    <SectionCard>
      <View style={styles.customerRow}>
        <View style={styles.avatarCircle}><Text style={styles.avatarText}>{initials}</Text></View>
        <View style={styles.customerCopy}>
          <Text style={styles.customerName}>{customerName}</Text>
          <Text style={styles.customerAddress}>{formatRiderAddress(job.order.addressSnapshot)}</Text>
          <TouchableOpacity style={styles.mapLink} onPress={onMap}>
            <MapPin size={16} color="#07966D" fill="#07966D" />
            <Text style={styles.mapLinkText}>View on Map</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.callCircle} onPress={onCall}>
          <Phone size={29} color="#FFFFFF" fill="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </SectionCard>
  );
}

function ProgressSteps() {
  const steps = [
    { label: 'Accepted', done: true },
    { label: 'Picked Up', done: true },
    { label: 'On the Way', done: true, active: true },
    { label: 'Delivered', done: false },
  ];
  return (
    <View style={styles.progressSteps}>
      {steps.map((step, index) => (
        <React.Fragment key={step.label}>
          <View style={styles.progressStepItem}>
            <View style={[
              styles.progressDot,
              step.done && styles.progressDotDone,
              step.active && styles.progressDotActive,
            ]}>
              {step.active ? <Navigation size={19} color="#FFFFFF" fill="#FFFFFF" /> : step.done ? <Check size={23} color="#FFFFFF" strokeWidth={3.2} /> : null}
            </View>
            <Text style={[styles.progressStepLabel, !step.done && styles.progressStepLabelMuted]}>{step.label}</Text>
          </View>
          {index < steps.length - 1 ? <View style={[styles.progressLine, index < 2 && styles.progressLineDone]} /> : null}
        </React.Fragment>
      ))}
    </View>
  );
}

function DeliveryProgressScreen({
  job,
  workspace,
  busy,
  onNavigate,
  onArrive,
  onIssue,
}: {
  job: RiderDeliveryJob;
  workspace: RiderWorkspace;
  busy: boolean;
  onNavigate: () => void;
  onArrive: () => void;
  onIssue: () => void;
}) {
  const customerName = job.order.customer?.name || job.order.addressSnapshot?.recipientName || 'Customer';
  const destination = typeof job.order.deliveryLat === 'number' && typeof job.order.deliveryLng === 'number'
    ? { latitude: job.order.deliveryLat, longitude: job.order.deliveryLng }
    : null;
  const riderLocation = typeof workspace.rider?.latitude === 'number' && typeof workspace.rider?.longitude === 'number'
    ? { latitude: workspace.rider.latitude, longitude: workspace.rider.longitude }
    : null;
  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#078E67" />
      <DeliveryHeader title="Delivery in Progress" leftMenu right="BELL" onRightPress={() => Toast.show({ type: 'info', text1: 'Delivery alerts', text2: 'No new delivery alerts.' })} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionCard>
          <View style={styles.liveTrackingRow}>
            <View style={styles.healthCircle}><HeartPulse size={31} color="#FFFFFF" /></View>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>Live Tracking</Text>
              <Text style={styles.healthText}>Location signal is healthy</Text>
              <Text style={styles.cardMuted}>Last updated just now</Text>
            </View>
            <View style={styles.healthScore}><Text style={styles.healthScoreText}>98%</Text></View>
          </View>
        </SectionCard>

        <View style={styles.routeCard}>
          <RiderRouteMap
            destination={destination}
            destinationLabel={customerName}
            active
            riderLocation={riderLocation}
          />
          <View style={styles.distanceBadge}>
            <Text style={styles.distanceMain}>Live route</Text>
            <Text style={styles.distanceSub}>to customer</Text>
          </View>
        </View>

        <SectionCard>
          <View style={styles.deliverToRow}>
            <View style={styles.flex}>
              <Text style={styles.cardMuted}>Deliver to</Text>
              <Text style={styles.largeName}>{customerName}</Text>
              <Text style={styles.addressLarge}>{formatRiderAddress(job.order.addressSnapshot)}</Text>
            </View>
            <TouchableOpacity style={styles.callCircle} onPress={() => {
              const phone = job.order.customer?.phone || job.order.addressSnapshot?.phoneE164;
              if (phone) void Linking.openURL(`tel:${phone}`);
              else Toast.show({ type: 'error', text1: 'Phone unavailable', text2: 'Customer phone number is unavailable.' });
            }}>
              <Phone size={29} color="#FFFFFF" fill="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </SectionCard>

        <SectionCard>
          <View style={styles.orderMetaRow}>
            <View>
              <Text style={styles.cardMuted}>Order ID</Text>
              <Text style={styles.orderId}>#{shortRiderOrderId(job.order.id)}</Text>
            </View>
            <View style={styles.orderTimeWrap}>
              <Text style={styles.cardMuted}>Order Time</Text>
              <Text style={styles.orderTime}>{job.createdAt ? new Date(job.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</Text>
            </View>
          </View>
          <ProgressSteps />
        </SectionCard>

        <PrimaryButton testID="rider_delivery_navigate_button" label="Navigate" onPress={onNavigate} icon={<Navigation size={27} color="#FFFFFF" fill="#FFFFFF" />} />
        <TouchableOpacity testID="rider_delivery_arrived_button" style={styles.secondaryWideButton} disabled={busy} onPress={onArrive}>
          {busy ? <ActivityIndicator color="#078E67" /> : <CheckCircle2 size={21} color="#078E67" />}
          <Text style={styles.secondaryWideText}>I have arrived at the customer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.reportLink} onPress={onIssue}>
          <CircleAlert size={17} color="#C52A2A" />
          <Text style={styles.reportLinkText}>Unable to complete this delivery?</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function ArrivedScreen({
  job,
  summary,
  onBack,
  onContinue,
  onIssue,
}: {
  job: RiderDeliveryJob;
  summary: DeliveryOperationsSummary | null;
  onBack: () => void;
  onContinue: () => void;
  onIssue: () => void;
}) {
  const items = job.order.items || [];
  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#078E67" />
      <DeliveryHeader title="Arrived at Customer" onBack={onBack} right="HELP" onRightPress={() => Toast.show({ type: 'info', text1: 'Delivery help', text2: 'Call the customer, confirm the address, then continue to verification.' })} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.arrivedHero}>
          <View style={styles.bigCheck}><Check size={46} color="#FFFFFF" strokeWidth={3.4} /></View>
          <Text style={styles.arrivedTitle}>You’ve Arrived!</Text>
          <Text style={styles.arrivedText}>Please contact the customer{`\n`}and proceed with verification.</Text>
        </View>

        <CustomerCard
          job={job}
          onCall={() => {
            const phone = job.order.customer?.phone || job.order.addressSnapshot?.phoneE164;
            if (phone) void Linking.openURL(`tel:${phone}`);
            else Toast.show({ type: 'error', text1: 'Phone unavailable', text2: 'Customer phone number is unavailable.' });
          }}
          onMap={() => {
            if (typeof job.order.deliveryLat === 'number' && typeof job.order.deliveryLng === 'number') {
              void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${job.order.deliveryLat},${job.order.deliveryLng}`);
            } else {
              Toast.show({ type: 'error', text1: 'Location unavailable', text2: 'Customer coordinates are unavailable.' });
            }
          }}
        />

        <SectionCard>
          <Text style={styles.sectionHeading}>Payment Method</Text>
          <View style={styles.paymentStrip}>
            <View style={styles.paymentCode}><Text style={styles.paymentCodeText}>{summary?.cod?.applicable ? 'COD' : 'PAID'}</Text></View>
            <Text style={styles.paymentMethod}>{summary?.cod?.applicable ? 'Cash on Delivery' : 'Prepaid Order'}</Text>
          </View>
        </SectionCard>

        <SectionCard>
          <View style={styles.sectionHeadingRow}>
            <Text style={styles.sectionHeading}>Order Summary</Text>
            <Text style={styles.itemsCount}>{items.reduce((total, item) => total + Number(item.quantity || 0), 0)} Items</Text>
          </View>
          {items.map((item, index) => (
            <View key={item.id || index} style={styles.itemRow}>
              <PackageCheck size={20} color="#4B5563" />
              <Text style={styles.itemName} numberOfLines={1}>{item.product?.name || 'Order item'}</Text>
              <Text style={styles.itemQty}>x{item.quantity || 0}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.orderIdRow}>
            <Text style={styles.cardMuted}>Order ID</Text>
            <Text style={styles.orderId}>#{shortRiderOrderId(job.order.id)}</Text>
          </View>
        </SectionCard>

        <PrimaryButton testID="rider_arrived_continue_button" label="Confirm Arrival & Continue" onPress={onContinue} />
        <TouchableOpacity style={styles.reportLink} onPress={onIssue}>
          <CircleAlert size={17} color="#C52A2A" />
          <Text style={styles.reportLinkText}>Report a delivery issue</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function ProofOption({
  title,
  subtitle,
  icon,
  active,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.proofOption, active && styles.proofOptionActive]} onPress={onPress}>
      <View style={styles.proofIcon}>{icon}</View>
      <View style={styles.flex}>
        <Text style={styles.proofTitle}>{title}</Text>
        <Text style={styles.proofSubtitle}>{subtitle}</Text>
      </View>
      {active ? <CheckCircle2 size={22} color="#07966D" fill="#E9F8F1" /> : null}
    </TouchableOpacity>
  );
}

function VerifyScreen({
  summary,
  otpCode,
  setOtpCode,
  proofChoice,
  setProofChoice,
  busy,
  now,
  onBack,
  onIssueOtp,
  onCollectCod,
  onVerify,
  onIssue,
}: {
  summary: DeliveryOperationsSummary;
  otpCode: string;
  setOtpCode: (value: string) => void;
  proofChoice: ProofChoice;
  setProofChoice: (value: ProofChoice) => void;
  busy: string | null;
  now: number;
  onBack: () => void;
  onIssueOtp: () => void;
  onCollectCod: () => void;
  onVerify: () => void;
  onIssue: () => void;
}) {
  const inputRef = useRef<TextInput>(null);
  const expiresAt = summary.otp.expiresAt ? new Date(summary.otp.expiresAt).getTime() : null;
  const seconds = expiresAt && Number.isFinite(expiresAt) ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : null;
  const expiryText = seconds == null
    ? 'OTP active'
    : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const codBlocked = summary.cod.applicable && summary.requirements.codCollectionRequired && !summary.cod.collected;
  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#078E67" />
      <DeliveryHeader title="Verify Delivery" onBack={onBack} right="SHIELD" onRightPress={() => Toast.show({ type: 'info', text1: 'Secure verification', text2: 'OTP, rider confirmation and live GPS are stored in the delivery audit trail.' })} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <SectionCard style={styles.verificationIntro}>
          <Text style={styles.verificationIntroText}>Complete verification to{`\n`}mark this delivery.</Text>
        </SectionCard>

        <SectionCard>
          <Text style={styles.verifyHeading}>Customer OTP / PIN</Text>
          <Text style={styles.verifySubheading}>Ask customer for the 6-digit OTP</Text>
          <TouchableOpacity activeOpacity={1} onPress={() => inputRef.current?.focus()} style={styles.otpWrap}>
            {Array.from({ length: 6 }).map((_, index) => (
              <View key={index} style={[styles.otpBox, otpCode[index] && styles.otpBoxFilled]}>
                <Text style={styles.otpDigit}>{otpCode[index] || ''}</Text>
              </View>
            ))}
            <TextInput
              ref={inputRef}
              testID="rider_verify_otp_input"
              value={otpCode}
              onChangeText={(value) => setOtpCode(value.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              style={styles.hiddenOtpInput}
              autoFocus={false}
            />
          </TouchableOpacity>
          <View style={styles.expiryRow}>
            <Clock3 size={19} color="#39434D" />
            <Text style={styles.expiryText}>OTP expires in <Text style={styles.expiryStrong}>{expiryText}</Text></Text>
          </View>
          <TouchableOpacity testID="rider_verify_issue_otp" style={styles.textButton} disabled={Boolean(busy)} onPress={onIssueOtp}>
            <Text style={styles.textButtonLabel}>{summary.otp.issued ? 'Issue a fresh OTP' : 'Issue customer OTP'}</Text>
          </TouchableOpacity>
        </SectionCard>

        <View style={styles.orRow}><View style={styles.orLine} /><Text style={styles.orText}>OR</Text><View style={styles.orLine} /></View>

        <Text style={styles.verifyHeading}>Select Proof Type</Text>
        <Text style={styles.verifySubheading}>Choose supporting proof for this delivery</Text>
        <ProofOption title="Customer Photo" subtitle="Take a photo with customer" active={proofChoice === 'CUSTOMER_PHOTO'} onPress={() => setProofChoice('CUSTOMER_PHOTO')} icon={<Camera size={29} color={proofChoice === 'CUSTOMER_PHOTO' ? '#07966D' : '#475569'} />} />
        <ProofOption title="Delivery Photo" subtitle="Take a photo of the delivery" active={proofChoice === 'DELIVERY_PHOTO'} onPress={() => setProofChoice('DELIVERY_PHOTO')} icon={<Camera size={29} color={proofChoice === 'DELIVERY_PHOTO' ? '#07966D' : '#475569'} />} />
        <ProofOption title="Signature" subtitle="Capture customer signature" active={proofChoice === 'SIGNATURE'} onPress={() => setProofChoice('SIGNATURE')} icon={<Signature size={29} color={proofChoice === 'SIGNATURE' ? '#07966D' : '#475569'} />} />
        <Text style={styles.proofNotice}>Customer OTP and live GPS remain the required auditable proof. The selected option is stored as the rider’s supporting-proof preference.</Text>

        {summary.cod.applicable ? (
          <SectionCard style={styles.codCard}>
            <View style={styles.codRow}>
              <View style={styles.codIcon}><IndianRupee size={25} color="#07966D" /></View>
              <View style={styles.flex}>
                <Text style={styles.proofTitle}>Cash on Delivery</Text>
                <Text style={styles.proofSubtitle}>Collect {formatRupees(Number(summary.cod.expectedAmountPaise || 0) / 100)}</Text>
              </View>
              {summary.cod.collected ? <CheckCircle2 size={27} color="#07966D" fill="#E9F8F1" /> : (
                <TouchableOpacity testID="rider_verify_collect_cod" onPress={onCollectCod} disabled={Boolean(busy)} style={styles.collectButton}>
                  {busy === 'cod' ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.collectButtonText}>Paid</Text>}
                </TouchableOpacity>
              )}
            </View>
          </SectionCard>
        ) : null}

        <View style={styles.securityNotice}>
          <LockKeyhole size={27} color="#07966D" />
          <Text style={styles.securityText}>This verification helps ensure safe{`\n`}and successful deliveries.</Text>
        </View>
        <PrimaryButton testID="rider_verify_complete_button" label="Verify & Complete Delivery" busy={busy === 'complete'} disabled={Boolean(busy) || codBlocked || otpCode.length !== 6} onPress={onVerify} />
        {codBlocked ? <Text style={styles.blockedText}>Record the COD payment before completing delivery.</Text> : null}
        <TouchableOpacity style={styles.reportLink} onPress={onIssue}>
          <CircleAlert size={17} color="#C52A2A" />
          <Text style={styles.reportLinkText}>Unable to verify this delivery?</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function IssueScreen({
  selectedIndex,
  setSelectedIndex,
  note,
  setNote,
  busy,
  onBack,
  onSubmit,
}: {
  selectedIndex: number;
  setSelectedIndex: (value: number) => void;
  note: string;
  setNote: (value: string) => void;
  busy: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#078E67" />
      <DeliveryHeader title="Report an Issue" onBack={onBack} right="SHIELD" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.issueHero}>
          <CircleAlert size={46} color="#D92D20" />
          <View style={styles.flex}>
            <Text style={styles.issueHeroTitle}>Unable to Complete Delivery</Text>
            <Text style={styles.issueHeroText}>Please tell us what went wrong.</Text>
          </View>
        </View>

        <SectionCard>
          <Text style={styles.issueHeading}>Select Reason</Text>
          {RIDER_FAILURE_CHOICES.map((choice, index) => (
            <TouchableOpacity key={`${choice.label}-${index}`} style={styles.reasonRow} onPress={() => setSelectedIndex(index)}>
              <View style={[styles.radioOuter, selectedIndex === index && styles.radioOuterActive]}>
                {selectedIndex === index ? <View style={styles.radioInner} /> : null}
              </View>
              <Text style={styles.reasonLabel}>{choice.label}</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.divider} />
          <Text style={styles.additionalHeading}>Additional Note <Text style={styles.optionalText}>(Optional)</Text></Text>
          <View style={styles.noteBox}>
            <TextInput
              testID="rider_issue_note_input"
              value={note}
              onChangeText={(value) => setNote(value.slice(0, 250))}
              placeholder="Add any additional details..."
              placeholderTextColor="#A3A7AD"
              style={styles.noteInput}
              multiline
              maxLength={250}
              textAlignVertical="top"
            />
            <Text style={styles.noteCount}>{note.length}/250</Text>
          </View>
        </SectionCard>

        <View style={styles.feedbackNotice}>
          <ShieldCheck size={37} color="#07966D" />
          <Text style={styles.feedbackText}>Your feedback helps us improve{`\n`}the delivery experience.</Text>
        </View>
        <PrimaryButton testID="rider_issue_submit_button" label="Submit Report" busy={busy} onPress={onSubmit} />
      </ScrollView>
    </View>
  );
}

function ReceiptRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.receiptRow}>
      <Text style={styles.receiptLabel}>{label}</Text>
      <Text style={[styles.receiptValue, strong && styles.receiptValueStrong]}>{value}</Text>
    </View>
  );
}

function CompletedScreen({ receipt, onHome }: { receipt: RiderCompletionReceipt; onHome: () => void }) {
  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#078E67" />
      <DeliveryHeader title="Delivery Completed" onBack={onHome} right="SHIELD" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.celebrationArea}>
          <Text style={[styles.confetti, { left: 50, top: 22 }]}>◆</Text>
          <Text style={[styles.confetti, { right: 58, top: 54, color: '#F59E0B' }]}>◆</Text>
          <Text style={[styles.confetti, { left: 105, top: 75, color: '#2563EB' }]}>◆</Text>
          <View style={styles.successCircle}><Check size={62} color="#FFFFFF" strokeWidth={3.3} /></View>
          <View style={styles.packageArt}>
            <PackageCheck size={98} color="#F59E0B" fill="#FFC247" />
            <View style={styles.medicalBag}><View style={styles.bagHandle} /><Text style={styles.bagPlus}>+</Text></View>
          </View>
          <Text style={styles.successTitle}>Successfully Delivered!</Text>
          <Text style={styles.successSubtitle}>Thank you for delivering with care.</Text>
        </View>

        <SectionCard>
          <View style={styles.sectionHeadingRow}>
            <Text style={styles.sectionHeading}>Order Summary</Text>
            <Text style={styles.receiptOrderId}>#{shortRiderOrderId(receipt.orderId)}</Text>
          </View>
          <ReceiptRow label="Items Delivered" value={`${receipt.itemCount} Items`} strong />
          <ReceiptRow label="Payment Method" value={receipt.paymentMethod} strong />
          <ReceiptRow label="Order Amount" value={formatRupees(receipt.orderAmount)} strong />
          <ReceiptRow label="Customer Paid" value={formatRupees(receipt.customerPaid)} strong />
        </SectionCard>

        <SectionCard style={styles.earningsCard}>
          <View style={styles.earningsHeader}>
            <Text style={styles.earningsTitle}>Your Earnings</Text>
            <Text style={styles.earningsTotal}>{formatRupees(receipt.earnings)}</Text>
          </View>
          {receipt.baseFare != null || receipt.distanceIncentive != null || receipt.surgeOther != null ? (
            <>
              <ReceiptRow label="Base Fare" value={formatRupees(receipt.baseFare)} strong />
              <ReceiptRow label="Distance Incentive" value={formatRupees(receipt.distanceIncentive)} strong />
              <ReceiptRow label="Surge / Other" value={formatRupees(receipt.surgeOther)} strong />
            </>
          ) : (
            <ReceiptRow label="Delivery payout" value={formatRupees(receipt.earnings)} strong />
          )}
        </SectionCard>

        <PrimaryButton testID="rider_completed_home_button" label="Continue to Home" onPress={onHome} />
      </ScrollView>
    </View>
  );
}

export const RiderDeliveryFlowScreen = () => {
  const queryClient = useQueryClient();
  const [overrideView, setOverrideView] = useState<Exclude<RiderDeliveryFlowView, 'LEGACY'> | null>(null);
  const [completionReceipt, setCompletionReceipt] = useState<RiderCompletionReceipt | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [proofChoice, setProofChoice] = useState<ProofChoice>('CUSTOMER_PHOTO');
  const [failureChoiceIndex, setFailureChoiceIndex] = useState(2);
  const [failureNote, setFailureNote] = useState('');
  const [now, setNow] = useState(Date.now());

  const workspaceQuery = useQuery<RiderWorkspace>({
    queryKey: WORKSPACE_KEY,
    queryFn: riderService.getWorkspace,
    refetchInterval: 8_000,
  });
  const workspace = workspaceQuery.data;
  const activeJob = workspace?.activeJob || null;
  const summaryQuery = useQuery<DeliveryOperationsSummary>({
    queryKey: [...SUMMARY_KEY, activeJob?.id],
    queryFn: () => deliveryOperationsService.getSummary(activeJob!.id),
    enabled: Boolean(activeJob?.id),
    refetchInterval: activeJob ? 10_000 : false,
  });
  const summary = summaryQuery.data || null;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setOverrideView(null);
    setCompletionReceipt(null);
    setOtpCode('');
    setFailureNote('');
  }, [activeJob?.id]);

  const view = useMemo(
    () => completionReceipt ? 'COMPLETE' : deliveryFlowViewForStatus(activeJob?.status, overrideView),
    [activeJob?.status, completionReceipt, overrideView],
  );

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }),
      queryClient.invalidateQueries({ queryKey: SUMMARY_KEY }),
      queryClient.invalidateQueries({ queryKey: EARNINGS_KEY }),
    ]);
  };

  const perform = async (key: string, task: () => Promise<unknown>, success?: string) => {
    if (busy) return false;
    setBusy(key);
    try {
      await task();
      await invalidateAll();
      if (success) Toast.show({ type: 'success', text1: success });
      return true;
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Operation failed', text2: errorMessage(error) });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const openNavigation = () => {
    if (!activeJob || typeof activeJob.order.deliveryLat !== 'number' || typeof activeJob.order.deliveryLng !== 'number') {
      Toast.show({ type: 'error', text1: 'Location unavailable', text2: 'Customer coordinates are unavailable.' });
      return;
    }
    void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${activeJob.order.deliveryLat},${activeJob.order.deliveryLng}&travelmode=driving`);
  };

  const arrive = () => {
    if (!activeJob) return;
    Alert.alert('Confirm arrival', 'Confirm that you have reached the customer location.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: () => void perform(
          'arrive',
          () => riderService.transitionJob(activeJob.id, 'ARRIVED_AT_CUSTOMER'),
          'Arrival confirmed',
        ).then((ok) => { if (ok) setOverrideView('ARRIVED'); }),
      },
    ]);
  };

  const issueOtp = () => {
    if (!activeJob) return;
    void perform('otp', () => deliveryOperationsService.issueOtp(activeJob.id), 'Customer OTP issued');
  };

  const collectCod = () => {
    if (!activeJob || !summary) return;
    Alert.alert(
      'Confirm cash received',
      `Confirm that ${formatRupees(Number(summary.cod.expectedAmountPaise || 0) / 100)} was collected from the customer.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm paid',
          onPress: () => void perform(
            'cod',
            () => deliveryOperationsService.collectCod(activeJob.id, {
              amountPaise: summary.cod.expectedAmountPaise,
              collectionReference: 'CASH_RECEIVED_BY_RIDER',
            }),
            'COD payment recorded',
          ),
        },
      ],
    );
  };

  const verifyDelivery = () => {
    if (!activeJob || !summary) return;
    if (otpCode.length !== 6) {
      Toast.show({ type: 'error', text1: 'Enter the customer OTP', text2: 'A valid 6-digit OTP/PIN is required.' });
      return;
    }
    if (summary.cod.applicable && summary.requirements.codCollectionRequired && !summary.cod.collected) {
      Toast.show({ type: 'error', text1: 'Record COD payment', text2: 'Confirm customer payment before delivery completion.' });
      return;
    }
    Alert.alert('Complete delivery?', 'OTP, live GPS and rider confirmation will be stored as proof of delivery.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete',
        onPress: () => {
          const receipt = buildRiderCompletionReceipt(activeJob, summary);
          void perform('complete', async () => {
            const location = await captureLocation();
            await deliveryOperationsService.completeDelivery(activeJob.id, {
              otpCode,
              proofType: 'CUSTOMER_OTP_PIN',
              riderConfirmed: true,
              note: `Supporting proof preference: ${proofChoice.replace(/_/g, ' ')}`,
              latitude: location.latitude,
              longitude: location.longitude,
              accuracyMetres: location.accuracyMetres,
            });
          }, 'Delivery completed').then((ok) => {
            if (!ok) return;
            setCompletionReceipt(receipt);
            setOverrideView('COMPLETE');
            setOtpCode('');
          });
        },
      },
    ]);
  };

  const submitIssue = () => {
    if (!activeJob) return;
    const failureChoice = RIDER_FAILURE_CHOICES[failureChoiceIndex];
    if (failureChoice.value === 'OTHER' && failureNote.trim().length < 3) {
      Toast.show({ type: 'error', text1: 'Add issue details', text2: 'Please describe the delivery issue.' });
      return;
    }
    Alert.alert('Submit delivery issue?', 'This starts the failed-delivery and return workflow.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Submit',
        style: 'destructive',
        onPress: () => void perform(
          'failure',
          () => deliveryOperationsService.recordFailure(activeJob.id, {
            reason: failureChoice.value,
            note: failureNote.trim() || undefined,
          }),
          'Delivery issue recorded',
        ).then((ok) => {
          if (ok) {
            setOverrideView(null);
            setFailureNote('');
          }
        }),
      },
    ]);
  };

  if (workspaceQuery.isLoading && !workspace) {
    return <View style={styles.loadingScreen}><ActivityIndicator size="large" color="#07966D" /><Text style={styles.loadingText}>Loading delivery…</Text></View>;
  }

  if (workspaceQuery.error && !workspace) {
    return <View style={styles.loadingScreen}><CircleAlert size={38} color="#B42318" /><Text style={styles.loadingText}>{errorMessage(workspaceQuery.error)}</Text><PrimaryButton label="Retry" onPress={() => void workspaceQuery.refetch()} /></View>;
  }

  if (view === 'COMPLETE' && completionReceipt) {
    return <CompletedScreen receipt={completionReceipt} onHome={() => {
      setCompletionReceipt(null);
      setOverrideView(null);
      void invalidateAll();
    }} />;
  }

  if (!workspace || !activeJob || view === 'LEGACY') {
    return <RiderDeliveryOperationsScreen />;
  }

  if (view === 'PROGRESS') {
    return <DeliveryProgressScreen job={activeJob} workspace={workspace} busy={busy === 'arrive'} onNavigate={openNavigation} onArrive={arrive} onIssue={() => setOverrideView('ISSUE')} />;
  }

  if (view === 'ARRIVED') {
    return <ArrivedScreen job={activeJob} summary={summary} onBack={() => setOverrideView(null)} onContinue={() => {
      if (!summary?.otp?.issued) issueOtp();
      setOverrideView('VERIFY');
    }} onIssue={() => setOverrideView('ISSUE')} />;
  }

  if (view === 'VERIFY') {
    if (!summary) {
      return <View style={styles.loadingScreen}><ActivityIndicator size="large" color="#07966D" /><Text style={styles.loadingText}>Loading verification…</Text></View>;
    }
    return <VerifyScreen summary={summary} otpCode={otpCode} setOtpCode={setOtpCode} proofChoice={proofChoice} setProofChoice={setProofChoice} busy={busy} now={now} onBack={() => setOverrideView('ARRIVED')} onIssueOtp={issueOtp} onCollectCod={collectCod} onVerify={verifyDelivery} onIssue={() => setOverrideView('ISSUE')} />;
  }

  if (view === 'ISSUE') {
    return <IssueScreen selectedIndex={failureChoiceIndex} setSelectedIndex={setFailureChoiceIndex} note={failureNote} setNote={setFailureNote} busy={busy === 'failure'} onBack={() => setOverrideView(activeJob.status === 'RIDER_AT_CUSTOMER' ? 'ARRIVED' : 'PROGRESS')} onSubmit={submitIssue} />;
  }

  return <RiderDeliveryOperationsScreen />;
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 112, gap: 16 },
  header: { height: 82, paddingTop: 18, paddingHorizontal: 18, backgroundColor: '#078E67', flexDirection: 'row', alignItems: 'center' },
  headerSide: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: '#FFFFFF', fontSize: 21, fontWeight: '800', textAlign: 'center' },
  bellBadge: { position: 'absolute', right: 2, top: 1, width: 20, height: 20, borderRadius: 10, backgroundColor: '#EF2929', alignItems: 'center', justifyContent: 'center' },
  bellBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, borderWidth: 1, borderColor: '#E4E7EB', padding: 17, shadowColor: '#111827', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  cardTitle: { color: '#111827', fontSize: 18, fontWeight: '800' },
  cardMuted: { color: '#667085', fontSize: 14, fontWeight: '500' },
  primaryButton: { minHeight: 66, borderRadius: 17, backgroundColor: '#078E67', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 13, paddingHorizontal: 18 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 21, fontWeight: '800' },
  buttonDisabled: { opacity: 0.48 },
  secondaryWideButton: { minHeight: 54, borderRadius: 15, borderWidth: 1, borderColor: '#A7DCCC', backgroundColor: '#F4FBF8', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  secondaryWideText: { color: '#078E67', fontSize: 15, fontWeight: '800' },
  reportLink: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 7 },
  reportLinkText: { color: '#C52A2A', fontSize: 13, fontWeight: '700' },
  liveTrackingRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  healthCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#07966D', alignItems: 'center', justifyContent: 'center' },
  healthText: { color: '#0B8A4D', fontSize: 17, fontWeight: '800', marginTop: 3 },
  healthScore: { minWidth: 78, height: 62, borderRadius: 18, backgroundColor: '#E8F5E4', alignItems: 'center', justifyContent: 'center' },
  healthScoreText: { color: '#0B8A4D', fontSize: 22, fontWeight: '900' },
  routeCard: { minHeight: 294, position: 'relative' },
  distanceBadge: { position: 'absolute', right: 16, bottom: 16, backgroundColor: '#FFFFFF', borderRadius: 17, paddingHorizontal: 18, paddingVertical: 12, shadowColor: '#111827', shadowOpacity: 0.14, shadowRadius: 10, elevation: 5 },
  distanceMain: { color: '#111827', fontSize: 18, fontWeight: '900' },
  distanceSub: { color: '#4B5563', fontSize: 13, marginTop: 2 },
  deliverToRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  largeName: { color: '#111827', fontSize: 23, fontWeight: '900', marginTop: 5 },
  addressLarge: { color: '#4B5563', fontSize: 17, lineHeight: 27, marginTop: 7 },
  callCircle: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#07966D', alignItems: 'center', justifyContent: 'center' },
  orderMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderTimeWrap: { alignItems: 'flex-end' },
  orderId: { color: '#111827', fontSize: 19, fontWeight: '900', marginTop: 4 },
  orderTime: { color: '#111827', fontSize: 17, fontWeight: '800', marginTop: 4 },
  progressSteps: { marginTop: 27, flexDirection: 'row', alignItems: 'flex-start' },
  progressStepItem: { width: 72, alignItems: 'center' },
  progressDot: { width: 48, height: 48, borderRadius: 24, borderWidth: 3, borderColor: '#A6A9AE', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  progressDotDone: { backgroundColor: '#0DA560', borderColor: '#0DA560' },
  progressDotActive: { backgroundColor: '#078E67', borderColor: '#078E67' },
  progressStepLabel: { color: '#344054', fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 9 },
  progressStepLabelMuted: { color: '#8A9098' },
  progressLine: { flex: 1, height: 3, backgroundColor: '#C7C9CC', marginTop: 23, marginHorizontal: -5 },
  progressLineDone: { backgroundColor: '#0DA560' },
  arrivedHero: { minHeight: 280, borderRadius: 22, backgroundColor: '#EDF9F4', borderWidth: 1, borderColor: '#CDE8DE', alignItems: 'center', justifyContent: 'center', padding: 25 },
  bigCheck: { width: 92, height: 92, borderRadius: 46, backgroundColor: '#07966D', alignItems: 'center', justifyContent: 'center' },
  arrivedTitle: { color: '#111827', fontSize: 27, fontWeight: '900', marginTop: 25 },
  arrivedText: { color: '#56606B', fontSize: 18, lineHeight: 28, textAlign: 'center', marginTop: 12 },
  customerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  avatarCircle: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#087E6F', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  customerCopy: { flex: 1 },
  customerName: { color: '#111827', fontSize: 22, fontWeight: '900' },
  customerAddress: { color: '#4B5563', fontSize: 16, lineHeight: 25, marginTop: 8 },
  mapLink: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  mapLinkText: { color: '#07966D', fontSize: 16, fontWeight: '800' },
  sectionHeading: { color: '#111827', fontSize: 21, fontWeight: '900' },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemsCount: { color: '#667085', fontSize: 16, fontWeight: '600' },
  paymentStrip: { marginTop: 15, minHeight: 58, borderRadius: 15, backgroundColor: '#F0FAF5', borderWidth: 1, borderColor: '#CEEADA', flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  paymentCode: { alignSelf: 'stretch', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: '#CEEADA' },
  paymentCodeText: { color: '#07966D', fontSize: 18, fontWeight: '900' },
  paymentMethod: { color: '#14845E', fontSize: 17, fontWeight: '600', paddingHorizontal: 18 },
  itemRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 11 },
  itemName: { flex: 1, color: '#344054', fontSize: 16, fontWeight: '500' },
  itemQty: { color: '#344054', fontSize: 16, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 11 },
  orderIdRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  verificationIntro: { minHeight: 118, justifyContent: 'center' },
  verificationIntroText: { color: '#344054', fontSize: 21, lineHeight: 31, fontWeight: '500' },
  verifyHeading: { color: '#111827', fontSize: 23, fontWeight: '900' },
  verifySubheading: { color: '#344054', fontSize: 17, marginTop: 9 },
  otpWrap: { marginTop: 23, flexDirection: 'row', justifyContent: 'space-between', position: 'relative' },
  otpBox: { width: 45, height: 66, borderRadius: 12, borderWidth: 1, borderColor: '#D0D5DD', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  otpBoxFilled: { borderColor: '#07966D', backgroundColor: '#F4FBF8' },
  otpDigit: { color: '#111827', fontSize: 29, fontWeight: '800' },
  hiddenOtpInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  expiryRow: { marginTop: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  expiryText: { color: '#344054', fontSize: 16 },
  expiryStrong: { color: '#111827', fontWeight: '900' },
  textButton: { alignSelf: 'center', marginTop: 14, paddingHorizontal: 14, paddingVertical: 8 },
  textButtonLabel: { color: '#07966D', fontSize: 14, fontWeight: '800' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingHorizontal: 25, marginVertical: 3 },
  orLine: { flex: 1, height: 1, backgroundColor: '#D6D9DE' },
  orText: { color: '#5D6672', fontSize: 18, fontWeight: '700' },
  proofOption: { minHeight: 102, borderRadius: 18, borderWidth: 1, borderColor: '#DFE2E6', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 17 },
  proofOptionActive: { borderColor: '#07966D', backgroundColor: '#F7FCF9' },
  proofIcon: { width: 42, alignItems: 'center' },
  proofTitle: { color: '#111827', fontSize: 18, fontWeight: '900' },
  proofSubtitle: { color: '#4B5563', fontSize: 15, marginTop: 5 },
  proofNotice: { color: '#667085', fontSize: 12, lineHeight: 18, marginTop: -4 },
  codCard: { backgroundColor: '#F5FBF8', borderColor: '#CBE8DC' },
  codRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  codIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E0F4EA', alignItems: 'center', justifyContent: 'center' },
  collectButton: { minWidth: 62, height: 42, borderRadius: 12, backgroundColor: '#07966D', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  collectButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  securityNotice: { minHeight: 108, borderRadius: 18, borderWidth: 1, borderColor: '#CBE8DC', backgroundColor: '#F0FAF6', flexDirection: 'row', alignItems: 'center', gap: 21, paddingHorizontal: 21 },
  securityText: { color: '#344054', fontSize: 17, lineHeight: 25 },
  blockedText: { color: '#B45309', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: -7 },
  issueHero: { minHeight: 128, borderRadius: 20, borderWidth: 1, borderColor: '#F2B8B5', backgroundColor: '#FFF4F3', flexDirection: 'row', alignItems: 'center', gap: 20, paddingHorizontal: 22 },
  issueHeroTitle: { color: '#111827', fontSize: 21, fontWeight: '900' },
  issueHeroText: { color: '#4B5563', fontSize: 16, marginTop: 7 },
  issueHeading: { color: '#111827', fontSize: 24, fontWeight: '900', marginBottom: 12 },
  reasonRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 16 },
  radioOuter: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: '#9BA0A7', alignItems: 'center', justifyContent: 'center' },
  radioOuterActive: { borderColor: '#07966D' },
  radioInner: { width: 17, height: 17, borderRadius: 9, backgroundColor: '#07966D' },
  reasonLabel: { color: '#111827', fontSize: 18, flex: 1 },
  additionalHeading: { color: '#111827', fontSize: 22, fontWeight: '900' },
  optionalText: { color: '#5D6672', fontSize: 17, fontWeight: '500' },
  noteBox: { minHeight: 168, borderRadius: 15, borderWidth: 1, borderColor: '#D0D5DD', marginTop: 15, padding: 14, position: 'relative' },
  noteInput: { minHeight: 118, color: '#111827', fontSize: 16, padding: 0 },
  noteCount: { position: 'absolute', right: 13, bottom: 11, color: '#667085', fontSize: 15, fontWeight: '700' },
  feedbackNotice: { minHeight: 100, borderRadius: 18, borderWidth: 1, borderColor: '#CBE8DC', backgroundColor: '#F0FAF6', flexDirection: 'row', alignItems: 'center', gap: 21, paddingHorizontal: 21 },
  feedbackText: { color: '#344054', fontSize: 16, lineHeight: 24 },
  celebrationArea: { minHeight: 420, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  confetti: { position: 'absolute', color: '#16A34A', fontSize: 19 },
  successCircle: { width: 152, height: 152, borderRadius: 76, backgroundColor: '#07966D', alignItems: 'center', justifyContent: 'center' },
  packageArt: { marginTop: -12, width: 220, height: 122, alignItems: 'center', justifyContent: 'center' },
  medicalBag: { position: 'absolute', right: 42, bottom: 13, width: 75, height: 80, borderRadius: 13, backgroundColor: '#0AA46A', alignItems: 'center', justifyContent: 'center' },
  bagHandle: { position: 'absolute', top: -20, width: 45, height: 28, borderWidth: 8, borderColor: '#0AA46A', borderBottomWidth: 0, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  bagPlus: { color: '#FFFFFF', fontSize: 42, fontWeight: '900' },
  successTitle: { color: '#07966D', fontSize: 27, fontWeight: '900', marginTop: 16 },
  successSubtitle: { color: '#667085', fontSize: 17, marginTop: 10 },
  receiptOrderId: { color: '#667085', fontSize: 18, fontWeight: '700' },
  receiptRow: { minHeight: 56, borderBottomWidth: 1, borderBottomColor: '#EAECF0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  receiptLabel: { color: '#667085', fontSize: 16 },
  receiptValue: { color: '#111827', fontSize: 16, fontWeight: '600' },
  receiptValueStrong: { fontWeight: '900' },
  earningsCard: { backgroundColor: '#F0FAF6', borderColor: '#CBE8DC' },
  earningsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  earningsTitle: { color: '#07966D', fontSize: 21, fontWeight: '900' },
  earningsTotal: { color: '#07966D', fontSize: 22, fontWeight: '900' },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', gap: 15, padding: 24 },
  loadingText: { color: '#667085', fontSize: 15, fontWeight: '700', textAlign: 'center' },
});
