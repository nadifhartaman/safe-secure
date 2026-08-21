"use client";

import Image from "next/image";
import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Lock, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardLogin,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Schema validasi dengan Zod
const loginSchema = z.object({
  email: z.string().email({ message: "Format email tidak valid" }),
  password: z.string().min(6, { message: "Password minimal 6 karakter" }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    // Simulasi request API login
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log("Data Login:", data);
  };

  return (
    <div className="flex min-h-screen items-center justify-between bg-slate-50 dark:bg-slate-900">
      <div className="bg-blue-100 text-white rounded-r-full aspect-square h-screen p-10 flex flex-col justify-center items-center">
        <Image
          src="/images/orion-logo-biru.png"
          alt="Logo Orion"
          width={400}
          height={400}
          className="hidden md:block"
        />
      </div>
      <CardLogin className="w-full max-w-md shadow-lg mx-auto my-10">
        <CardHeader className="space-y-0 text-center">
          <CardTitle className="text-2xl font-bold text-[#435a92]">Selamat Datang</CardTitle>
          <CardDescription >
            Masukkan email dan password Anda untuk masuk ke akun
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            {/* Input Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="nama@domain.com"
                  className="pl-9"
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>

            {/* Input Password */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <a
                  href="#"
                  className="text-xs text-primary hover:underline"
                >
                  Lupa password?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-9"
                  {...register("password")}
                />
              </div>
              {errors.password && (
                <p className="text-xs text-red-500">
                  {errors.password.message}
                </p>
              )}
            </div>
          </CardContent>

          <CardFooter className={`flex flex-col space-y-4 mt-5 ${isSubmitting ? "opacity-50 pointer-events-none" : ""}`}>
            <Button
              type="submit"
              className={`w-full ${isSubmitting ? "" : "bg-[#dbeafe] font-semibold text-[#435a92] hover:bg-[#435a92] hover:text-white"}`}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Memproses..." : "Masuk"}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Belum punya akun?{" "}
              <a href="#" className="text-primary hover:underline font-medium">
                Daftar sekarang
              </a>
            </p>
          </CardFooter>
        </form>
      </CardLogin>
    </div>
  );
}