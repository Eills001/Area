/**
 * 天气查询子技能
 *
 * 用于主动推送天气信息，尤其适合：
 * - 晨起问候时顺带告知天气
 * - 恶劣天气预警
 * - 出行前天气提醒
 */

/**
 * 查询饶阳县天气（默认位置）
 */
export async function getWeather(location = '饶阳县') {
  // 使用 wttr.in 免费 API
  const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1&lang=zh`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const current = data.current_condition[0];

    return {
      location,
      temp_c: current.temp_C,
      humidity: current.humidity,
      weather_desc: current.weatherDesc[0]?.value || current.lang_zh?.[0]?.value || '未知',
      wind: current.winddir16Point,
      wind_speed_kmh: current.windspeedKmph,
      uv_index: current.uvIndex,
    };
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * 生成天气问候语
 */
export function weatherGreeting(weather) {
  const temp = parseInt(weather.temp_c);
  const desc = weather.weather_desc;

  if (temp > 35) return `今天${temp}°C，热得不行，注意防暑 🥵`;
  if (temp > 30) return `今天${temp}°C，挺热的，多喝水 ☀️`;
  if (temp > 20) return `今天${temp}°C，${desc}，挺舒服的温度 ~`;
  if (temp > 10) return `今天${temp}°C，${desc}，出门带件外套`;
  return `今天${temp}°C，${desc}，注意保暖 🧣`;
}

export default { getWeather, weatherGreeting };
