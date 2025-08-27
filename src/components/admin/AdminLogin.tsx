
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AdminApi } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import Layout from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Shield, Loader2, Eye, EyeOff } from 'lucide-react';

const adminLoginSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
});

type AdminLoginValues = z.infer<typeof adminLoginSchema>;

interface AdminLoginProps {
  onLoginSuccess: () => void;
}

const AdminLogin = ({ onLoginSuccess }: AdminLoginProps) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<AdminLoginValues>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: {
      email: 'yekinirasheed2002@gmail.com',
      password: '',
    },
  });

  const onSubmit = async (values: AdminLoginValues) => {
    setIsLoading(true);

    try {
      console.log('🔐 Attempting admin login with:', { email: values.email, hasPassword: !!values.password });
      
      const response = await AdminApi.login({
        email: values.email,
        password: values.password
      });

      console.log('📡 Admin login response:', { 
        success: response.success, 
        hasData: !!response.data,
        hasToken: !!response.data?.token,
        userRole: response.data?.user?.role,
        adminRole: response.data?.admin?.role
      });

      if (response.success && response.data?.token) {
        console.log('🔍 Complete admin login response:', {
          fullResponse: response,
          hasToken: !!response.data.token,
          hasAdmin: !!response.data.admin,
          hasUser: !!response.data.user,
          tokenValue: response.data.token?.substring(0, 20) + '...',
          responseKeys: Object.keys(response),
          dataKeys: response.data ? Object.keys(response.data) : []
        });

        // Backend returns both user and admin objects - prefer admin, fallback to user
        const adminUser = response.data.admin || response.data.user;
        
        console.log('🔍 Selected admin user:', {
          selectedUser: adminUser,
          role: adminUser?.role,
          hasRequiredRole: adminUser?.role === 'admin'
        });
        
        if (!adminUser) {
          console.error('❌ No user data in response:', response.data);
          throw new Error('Invalid response: missing user data');
        }
        
        if (adminUser.role !== 'admin') {
          console.error('❌ Access denied - invalid admin role:', { 
            userRole: adminUser.role,
            expectedRole: 'admin',
            userData: adminUser
          });
          throw new Error('Access denied. Admin privileges required.');
        }
        
        // Store admin token using centralized function
        const { setAdminToken } = await import('@/services/api');
        setAdminToken(response.data.token);
        localStorage.setItem('admin_user', JSON.stringify(adminUser));
        
        // Update user context with admin user
        window.dispatchEvent(new CustomEvent('adminLoginSuccess', { 
          detail: { 
            user: adminUser,
            token: response.data.token 
          } 
        }));
        
        // Force socket service to reconnect with new admin token
        const socketService = (await import('@/services/socket')).default;
        if (socketService.isSocketConnected()) {
          socketService.disconnect();
        }
        setTimeout(() => {
          socketService.connect();
        }, 100);
        
        toast({
          title: 'Admin Access Granted',
          description: 'Welcome to the admin panel.',
        });
        
        onLoginSuccess();
      } else {
        throw new Error(response.error || 'Invalid admin credentials or insufficient permissions');
      }
    } catch (error) {
      console.error('❌ Admin login error:', error);
      toast({
        variant: 'destructive',
        title: 'Login failed',
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="container py-20">
        <div className="max-w-md mx-auto">
          <Card className="glass">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 bg-veilo-purple-light rounded-full flex items-center justify-center mb-4">
                <Shield className="h-6 w-6 text-veilo-purple-dark" />
              </div>
              <CardTitle className="text-2xl font-bold text-veilo-purple-dark">
                Admin Login
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="yekinirasheed2002@gmail.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input 
                              type={showPassword ? "text" : "password"} 
                              placeholder="••••••••" 
                              {...field} 
                              className="pr-10"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                              onClick={() => setShowPassword(!showPassword)}
                            >
                              {showPassword ? (
                                <EyeOff className="h-4 w-4 text-gray-500" />
                              ) : (
                                <Eye className="h-4 w-4 text-gray-500" />
                              )}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <Button 
                    type="submit" 
                    className="w-full bg-veilo-purple hover:bg-veilo-purple-dark"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Logging in...
                      </>
                    ) : (
                      'Login to Admin Panel'
                    )}
                  </Button>
                  
                  <div className="text-center text-sm text-gray-500 mt-4">
                    <p>For demo: yekinirasheed2002@gmail.com / admin123</p>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default AdminLogin;
