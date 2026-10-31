"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import { setCredentials } from "@/store/slices/auth";
import { Icon } from "@iconify/react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { loginSchema } from "@/lib/validations/auth";
import { useForm } from "@/hooks/useForm";
import { Images } from "@/utlis/images";
import api from "@/lib/axios";
import { LOGIN } from "@/utlis/apiRoutes";

export default function LoginPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const {
    values,
    errors,
    message: error,
    isLoading,
    handleInputChange,
    handleSubmit,
  } = useForm({
    initialValues: { email: "", password: "" },
    validationSchema: loginSchema,
    successMessage: "", // Prevent "Success" text from appearing in the error box
    onSubmit: async (data) => {
      const response = await api.post(LOGIN, data);
      const resData = response.data.data;
      localStorage.setItem("token", resData.token);
      dispatch(setCredentials({ user: resData.user, token: resData.token }));

      // Use window.location.href to guarantee a full navigation to home so AuthGuard can run fresh
      window.location.href = "/";
    },
  });

  return (
    <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl sm:p-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <Image
          src={Images.Logo}
          alt="Logo"
          width={100}
          height={100}
          className="mb-4 w-auto h-auto"
          priority
        />
      </div>

      <h1 className="text-center text-2xl font-bold text-zinc-900">
        Login to your account
      </h1>
      <p className="mt-1 text-center text-sm text-zinc-500">
        Access your dashboard to manage orders and menu.
      </p>

      {error && (
        <p className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-4">
        <Input
          type="text"
          placeholder="Email or phone number"
          icon={<Icon icon="mdi:email-outline" className="h-5 w-5" />}
          value={values.email}
          onChange={handleInputChange("email")}
          error={errors.email}
        />

        <Input
          type="password"
          placeholder="Password"
          icon={<Icon icon="mdi:lock-outline" className="h-5 w-5" />}
          value={values.password}
          onChange={handleInputChange("password")}
          error={errors.password}
        />


        <Button type="submit" isLoading={isLoading} className="mt-2 w-full">
          {isLoading ? "Signing in..." : "Login"}
        </Button>
      </form>


    </div>
  );
}
