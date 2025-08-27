import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LiveSanctuaryApi } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { 
  Mic, 
  Users, 
  Shield, 
  Clock, 
  AlertTriangle, 
  Volume2,
  Loader2 
} from 'lucide-react';

const liveSanctuarySchema = z.object({
  topic: z.string().min(3, 'Topic must be at least 3 characters').max(100, 'Topic must not exceed 100 characters'),
  description: z.string().optional(),
  emoji: z.string().optional(),
  maxParticipants: z.number().min(2).max(100).default(50),
  audioOnly: z.boolean().default(true),
  allowAnonymous: z.boolean().default(true),
  moderationEnabled: z.boolean().default(true),
  emergencyContactEnabled: z.boolean().default(true),
  expireHours: z.number().min(1).max(168).default(24), // 1 hour to 1 week
});

type LiveSanctuaryFormData = z.infer<typeof liveSanctuarySchema>;

const LiveSanctuaryCreator: React.FC = () => {
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const form = useForm<LiveSanctuaryFormData>({
    resolver: zodResolver(liveSanctuarySchema),
    defaultValues: {
      topic: '',
      description: '',
      emoji: '🎙️',
      maxParticipants: 50,
      audioOnly: true,
      allowAnonymous: true,
      moderationEnabled: true,
      emergencyContactEnabled: true,
      expireHours: 24,
    },
  });

  const onSubmit = async (data: LiveSanctuaryFormData) => {
    setIsCreating(true);
    
    try {
      console.log('🎙️ Creating live sanctuary session:', data);
      
      const response = await LiveSanctuaryApi.createSession({
        topic: data.topic,
        description: data.description,
        emoji: data.emoji,
        maxParticipants: data.maxParticipants,
        audioOnly: data.audioOnly,
        allowAnonymous: data.allowAnonymous,
        moderationEnabled: data.moderationEnabled,
        emergencyContactEnabled: data.emergencyContactEnabled,
        expireHours: data.expireHours,
      });

      console.log('📡 Live sanctuary creation response:', { 
        success: response.success, 
        hasData: !!response.data,
        hasSession: !!response.data?.session,
        sessionData: response.data?.session 
      });

      if (response.success && response.data?.session) {
        // Extract sessionId with proper fallback chain
        const session = response.data.session;
        const sessionId = session.id || session._id || session.sessionId;
        
        console.log('🔍 Session ID extraction:', {
          sessionObject: session,
          extractedId: sessionId,
          sessionId: session.id,
          _id: session._id,
          sessionIdField: session.sessionId
        });
        
        if (!sessionId) {
          console.error('❌ No session ID found in response:', {
            session,
            fullResponse: response.data
          });
          throw new Error('Invalid response: missing session ID');
        }
        
        console.log('✅ Session created with ID:', sessionId);
        
        toast({
          title: 'Live Sanctuary Created',
          description: `Your live audio session "${data.topic}" is now active.`,
        });

        // Navigate to the live sanctuary space as host with proper session ID
        const navigationUrl = `/sanctuary/live/${sessionId}?role=host`;
        console.log('🧭 Navigating to:', navigationUrl);
        
        navigate(navigationUrl);
      } else {
        console.error('❌ Invalid response structure:', response);
        throw new Error(response.error || 'Failed to create live sanctuary session - invalid response');
      }
    } catch (error) {
      console.error('❌ Live sanctuary creation error:', error);
      toast({
        title: 'Creation Failed',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card className="glass">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mb-4">
            <Mic className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Create Live Audio Sanctuary
          </CardTitle>
          <p className="text-muted-foreground">
            Host a real-time anonymous audio support session
          </p>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Topic */}
              <FormField
                control={form.control}
                name="topic"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Volume2 className="h-4 w-4" />
                      Session Topic
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Anxiety Support Circle, Late Night Chat..." 
                        {...field} 
                        className="text-lg"
                      />
                    </FormControl>
                    <FormDescription>
                      Choose a clear, welcoming topic that describes your session
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Provide more details about what participants can expect..."
                        {...field}
                        rows={3}
                      />
                    </FormControl>
                    <FormDescription>
                      Help participants understand the session's purpose and guidelines
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Emoji */}
              <FormField
                control={form.control}
                name="emoji"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Session Emoji</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="🎙️" 
                        {...field}
                        className="w-20 text-center text-xl"
                        maxLength={2}
                      />
                    </FormControl>
                    <FormDescription>
                      Choose an emoji to represent your session
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Max Participants */}
              <FormField
                control={form.control}
                name="maxParticipants"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Maximum Participants: {field.value}
                    </FormLabel>
                    <FormControl>
                      <Slider
                        min={2}
                        max={100}
                        step={1}
                        value={[field.value]}
                        onValueChange={(value) => field.onChange(value[0])}
                        className="w-full"
                      />
                    </FormControl>
                    <FormDescription>
                      Smaller groups (5-15) often work better for intimate discussions
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Duration */}
              <FormField
                control={form.control}
                name="expireHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Session Duration: {field.value} hours
                    </FormLabel>
                    <FormControl>
                      <Slider
                        min={1}
                        max={168}
                        step={1}
                        value={[field.value]}
                        onValueChange={(value) => field.onChange(value[0])}
                        className="w-full"
                      />
                    </FormControl>
                    <FormDescription>
                      How long should this session remain available? (1 hour - 1 week)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Session Settings</h3>
                
                <FormField
                  control={form.control}
                  name="allowAnonymous"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Allow Anonymous Participants</FormLabel>
                        <FormDescription>
                          Let people join without creating an account
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="moderationEnabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5 flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        <div>
                          <FormLabel className="text-base">AI Moderation</FormLabel>
                          <FormDescription>
                            Automatically detect and prevent harmful content
                          </FormDescription>
                        </div>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="emergencyContactEnabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        <div>
                          <FormLabel className="text-base">Emergency Protocols</FormLabel>
                          <FormDescription>
                            Enable crisis detection and emergency response
                          </FormDescription>
                        </div>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {/* Submit Button */}
              <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-3 text-lg"
                disabled={isCreating}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Creating Session...
                  </>
                ) : (
                  <>
                    <Mic className="mr-2 h-5 w-5" />
                    Start Live Audio Session
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default LiveSanctuaryCreator;